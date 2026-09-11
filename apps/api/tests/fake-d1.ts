/// <reference types="@cloudflare/workers-types" />

/**
 * In-memory D1 shim for route tests. Implements exactly the statements
 * this session's repositories use (admins 8, sessions 5, settings 3,
 * plus the auth JOIN) — pattern-matched on the SQL text. Any new SQL in
 * src/storage/d1 requires a matching arm here. If that drift becomes
 * painful, swap this file for real SQLite via better-sqlite3.
 *
 * Bindings use positional ?N params, mirroring D1.
 */

interface Row {
  [column: string]: unknown;
}

interface Statement {
  bind(...params: unknown[]): Omit<Statement, "bind">;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export class FakeD1Error extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function createFakeD1() {
  const admins: Row[] = [];
  const sessions: Row[] = [];
  const settings: Row[] = [];

  function findAdminByField(field: string, value: unknown): Row | undefined {
    return admins.find((row) => String(row[field]).toLowerCase() === String(value).toLowerCase());
  }

  function publicAdmin(row: Row): Row {
    const clone = { ...row };
    delete clone.password_hash;
    return clone;
  }

  function selectAdmins(sql: string, params: unknown[]): unknown {
    const withHash = sql.includes("password_hash");
    const toRow = (row: Row): Row => (withHash ? { ...row } : publicAdmin(row));

    // WHERE id = ?1 (getById, post-INSERT verification)
    if (sql.includes("WHERE id = ?1")) {
      const row = admins.find((candidate) => candidate.id === params[0]);
      return row ? [toRow(row)] : [];
    }
    // WHERE username = ?1 (getByUsername — NOCASE in real D1)
    if (sql.includes("WHERE username = ?1")) {
      const row = findAdminByField("username", params[0]);
      return row ? [toRow(row)] : [];
    }
    // No WHERE clause: full list (ORDER BY created_at ASC ≈ insertion order).
    return admins.map(toRow);
  }

  function updateAdmin(sql: string, params: unknown[]): number {
    // UPDATE ... RETURNING (id = ?1)
    const id = params[0];
    if (sql.includes("SET role =")) {
      const row = admins.find((candidate) => candidate.id === id);
      if (!row) return 0;
      row.role = params[1];
      row.is_active = params[2];
      row.last_login_at = params[3];
      row.password_hash = params[4];
      row.updated_at = params[5];
      return 1;
    }
    return 0;
  }

  const db = {
    prepare(sql: string): Statement {
      const bound: unknown[] = [];
      const statement: Statement = {
        bind(...params: unknown[]) {
          bound.push(...params);
          return statement;
        },
        async first<T = Row>(): Promise<T | null> {
          const result = exec(sql, bound, { single: true });
          if (result === null) return null;
          const rows = result as Row[];
          return (rows[0] as T) ?? null;
        },
        async all<T = Row>(): Promise<{ results: T[] }> {
          const rows = exec(sql, bound, { single: false });
          return { results: rows as T[] };
        },
        async run() {
          const changes = exec(sql, bound, { mutate: true }) as unknown as number;
          return { meta: { changes: typeof changes === "number" ? changes : 0 } };
        },
      };
      return statement;
    },
  };

  function exec(
    sql: string,
    params: unknown[],
    options: { single?: boolean; mutate?: boolean } = {},
  ): unknown {
    void options;
    const normalized = sql.replace(/\s+/g, " ").trim();

    // ---- admins: COUNT ----
    if (normalized.startsWith("SELECT COUNT(*)")) {
      const isOwners = normalized.includes("role = 'owner'");
      const excluding = normalized.includes("id != ?1");
      const n = admins.filter((row) => {
        if (isOwners && row.role !== "owner") return false;
        if (excluding && row.id === params[0]) return false;
        return true;
      }).length;
      return [{ n }];
    }

    // ---- admins: SELECT ----
    if (normalized.startsWith("SELECT id, username, role, is_active")) {
      return selectAdmins(normalized, params);
    }
    if (normalized.startsWith("SELECT") && normalized.includes("FROM admins")) {
      // Plain existence probe (SELECT id FROM admins WHERE username = ?1)
      if (normalized.includes("WHERE username = ?1")) {
        const row = findAdminByField("username", params[0]);
        return row ? [{ ...row }] : null;
      }
      return selectAdmins(normalized, params);
    }

    // ---- admins: INSERT ----
    if (normalized.startsWith("INSERT INTO admins")) {
      const [id, username, passwordHash, role, isActive, lastLoginAt, createdAt, updatedAt] =
        params as [string, string, string, string, number, number | null, number, number];
      if (findAdminByField("username", username)) {
        throw new FakeD1Error("D1_UNIQUE", "UNIQUE constraint failed: admins.username");
      }
      admins.push({
        id,
        username,
        password_hash: passwordHash,
        role,
        is_active: isActive,
        last_login_at: lastLoginAt,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return 1;
    }

    // ---- admins: UPDATE ... RETURNING ----
    if (normalized.startsWith("UPDATE admins")) {
      const changed = updateAdmin(normalized, params);
      if (!changed) return [];
      const row = admins.find((candidate) => candidate.id === params[0])!;
      return [publicAdmin(row)];
    }

    // ---- admins: DELETE ----
    if (normalized.startsWith("DELETE FROM admins")) {
      const before = admins.length;
      const index = admins.findIndex((candidate) => candidate.id === params[0]);
      if (index >= 0) {
        admins.splice(index, 1);
        // FK ON DELETE CASCADE
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (sessions[i].admin_id === params[0]) sessions.splice(i, 1);
        }
      }
      return before - admins.length;
    }

    // ---- sessions: SELECT (auth join) ----
    if (normalized.startsWith("SELECT s.expires_at")) {
      const row = sessions.find((candidate) => candidate.token_hash === params[0]);
      if (!row) return null;
      const admin = admins.find((candidate) => candidate.id === row.admin_id);
      if (!admin) return null;
      return [
        {
          expires_at: row.expires_at,
          id: admin.id,
          username: admin.username,
          role: admin.role,
          is_active: admin.is_active,
        },
      ];
    }

    // ---- sessions: INSERT ----
    if (normalized.startsWith("INSERT INTO sessions")) {
      const [id, adminId, tokenHash, expiresAt, createdAt] = params as [
        string,
        string,
        string,
        number,
        number,
      ];
      if (sessions.some((candidate) => candidate.token_hash === tokenHash)) {
        throw new FakeD1Error("D1_UNIQUE", "UNIQUE constraint failed: sessions.token_hash");
      }
      sessions.push({
        id,
        admin_id: adminId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: createdAt,
      });
      return 1;
    }

    // ---- sessions: DELETE ----
    if (normalized.startsWith("DELETE FROM sessions")) {
      const before = sessions.length;
      if (normalized.includes("token_hash = ?1")) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (sessions[i].token_hash === params[0]) sessions.splice(i, 1);
        }
      } else if (normalized.includes("admin_id = ?1")) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          if (sessions[i].admin_id === params[0]) sessions.splice(i, 1);
        }
      } else if (normalized.includes("expires_at < ?1")) {
        for (let i = sessions.length - 1; i >= 0; i--) {
          if ((sessions[i].expires_at as number) < (params[0] as number)) {
            sessions.splice(i, 1);
          }
        }
      }
      return before - sessions.length;
    }

    // ---- settings ----
    if (normalized.startsWith("SELECT key, value FROM settings")) {
      return settings.map((row) => ({ ...row }));
    }
    if (normalized.startsWith("SELECT value FROM settings")) {
      const row = settings.find((candidate) => candidate.key === params[0]);
      return row ? [{ value: row.value }] : null;
    }
    if (normalized.startsWith("INSERT INTO settings")) {
      const [key, value, updatedAt] = params as [string, string, number];
      const existing = settings.find((candidate) => candidate.key === key);
      if (existing) {
        existing.value = value;
        existing.updated_at = updatedAt;
      } else {
        settings.push({ key, value, updated_at: updatedAt });
      }
      return 1;
    }

    throw new FakeD1Error("D1_UNSUPPORTED", `FakeD1 does not implement: ${normalized}`);
  }

  return db;
}
