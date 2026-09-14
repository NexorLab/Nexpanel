import {
  ConflictError,
  NotFoundError,
  type Backend,
  type BackendRepository,
} from "@nexpanel/core";

/**
 * D1-backed BackendRepository. name is UNIQUE (case-sensitive, unlike
 * usernames — backend names are technical labels). Rows are snake_case;
 * one mapper converts to the domain shape.
 */

interface BackendRow {
  id: string;
  name: string;
  protocol: Backend["protocol"];
  host: string;
  port: number;
  transport: Backend["transport"];
  security: Backend["security"];
  sni: string | null;
  host_header: string | null;
  path: string | null;
  service_name: string | null;
  uuid: string | null;
  password: string | null;
  method: string | null;
  reality_public_key: string | null;
  reality_short_id: string | null;
  fingerprint: string | null;
  allow_insecure: number;
  status: Backend["status"];
  sort_order: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  "id, name, protocol, host, port, transport, security, sni, host_header, path, service_name, uuid, password, method, reality_public_key, reality_short_id, fingerprint, allow_insecure, status, sort_order, created_at, updated_at";

function mapRow(row: BackendRow): Backend {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    transport: row.transport,
    security: row.security,
    sni: row.sni,
    hostHeader: row.host_header,
    path: row.path,
    serviceName: row.service_name,
    uuid: row.uuid,
    password: row.password,
    method: row.method,
    realityPublicKey: row.reality_public_key,
    realityShortId: row.reality_short_id,
    fingerprint: row.fingerprint,
    allowInsecure: row.allow_insecure !== 0,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Bind list in the exact order of the INSERT column list. */
function insertParams(backend: Omit<Backend, "createdAt" | "updatedAt">, now: number): unknown[] {
  return [
    backend.id,
    backend.name,
    backend.protocol,
    backend.host,
    backend.port,
    backend.transport,
    backend.security,
    backend.sni,
    backend.hostHeader,
    backend.path,
    backend.serviceName,
    backend.uuid,
    backend.password,
    backend.method,
    backend.realityPublicKey,
    backend.realityShortId,
    backend.fingerprint,
    backend.allowInsecure ? 1 : 0,
    backend.status,
    backend.sortOrder,
    now,
    now,
  ];
}

export function createBackendRepository(db: D1Database): BackendRepository {
  return {
    async list(params) {
      const where = params?.status ? "WHERE status = ?1" : "";
      const query = `SELECT ${COLUMNS} FROM backends ${where} ORDER BY sort_order ASC, created_at ASC`;
      const statement = db.prepare(query);
      const { results } = params?.status
        ? await statement.bind(params.status).all<BackendRow>()
        : await statement.all<BackendRow>();
      return results.map(mapRow);
    },

    async getById(id) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM backends WHERE id = ?1`)
        .bind(id)
        .first<BackendRow>();
      return row ? mapRow(row) : null;
    },

    async getByName(name) {
      const row = await db
        .prepare(`SELECT ${COLUMNS} FROM backends WHERE name = ?1`)
        .bind(name)
        .first<BackendRow>();
      return row ? mapRow(row) : null;
    },

    async create(backend) {
      const existing = await db
        .prepare("SELECT id FROM backends WHERE name = ?1")
        .bind(backend.name)
        .first<{ id: string }>();
      if (existing) {
        throw new ConflictError("NAME_TAKEN", "Backend name is already taken.");
      }
      const now = Math.floor(Date.now() / 1000);
      const result = await db
        .prepare(
          `INSERT INTO backends (${COLUMNS}) VALUES
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)`,
        )
        .bind(...insertParams(backend, now))
        .run();
      if (!result.meta.changes) {
        throw new ConflictError("NAME_TAKEN", "Backend name is already taken.");
      }
      const created = await db
        .prepare(`SELECT ${COLUMNS} FROM backends WHERE id = ?1`)
        .bind(backend.id)
        .first<BackendRow>();
      if (!created) throw new NotFoundError("Backend");
      return mapRow(created);
    },

    async update(id, patch) {
      const current = await db
        .prepare(`SELECT ${COLUMNS} FROM backends WHERE id = ?1`)
        .bind(id)
        .first<BackendRow>();
      if (!current) throw new NotFoundError("Backend");

      if (patch.name !== undefined) {
        const clash = await db
          .prepare("SELECT id FROM backends WHERE name = ?1")
          .bind(patch.name)
          .first<{ id: string }>();
        if (clash && clash.id !== id) {
          throw new ConflictError("NAME_TAKEN", "Backend name is already taken.");
        }
      }

      const merged = mapRow(current);
      if (patch.name !== undefined) merged.name = patch.name;
      if (patch.protocol !== undefined) merged.protocol = patch.protocol;
      if (patch.host !== undefined) merged.host = patch.host;
      if (patch.port !== undefined) merged.port = patch.port;
      if (patch.transport !== undefined) merged.transport = patch.transport;
      if (patch.security !== undefined) merged.security = patch.security;
      if (patch.sni !== undefined) merged.sni = patch.sni;
      if (patch.hostHeader !== undefined) merged.hostHeader = patch.hostHeader;
      if (patch.path !== undefined) merged.path = patch.path;
      if (patch.serviceName !== undefined) merged.serviceName = patch.serviceName;
      if (patch.uuid !== undefined) merged.uuid = patch.uuid;
      if (patch.password !== undefined) merged.password = patch.password;
      if (patch.method !== undefined) merged.method = patch.method;
      if (patch.realityPublicKey !== undefined) merged.realityPublicKey = patch.realityPublicKey;
      if (patch.realityShortId !== undefined) merged.realityShortId = patch.realityShortId;
      if (patch.fingerprint !== undefined) merged.fingerprint = patch.fingerprint;
      if (patch.allowInsecure !== undefined) merged.allowInsecure = patch.allowInsecure;
      if (patch.status !== undefined) merged.status = patch.status;
      if (patch.sortOrder !== undefined) merged.sortOrder = patch.sortOrder;

      const row = await db
        .prepare(
          `UPDATE backends SET
             name = ?2, protocol = ?3, host = ?4, port = ?5, transport = ?6, security = ?7,
             sni = ?8, host_header = ?9, path = ?10, service_name = ?11, uuid = ?12, password = ?13,
             method = ?14, reality_public_key = ?15, reality_short_id = ?16, fingerprint = ?17,
             allow_insecure = ?18, status = ?19, sort_order = ?20, updated_at = ?21
           WHERE id = ?1
           RETURNING ${COLUMNS}`,
        )
        .bind(
          id,
          merged.name,
          merged.protocol,
          merged.host,
          merged.port,
          merged.transport,
          merged.security,
          merged.sni,
          merged.hostHeader,
          merged.path,
          merged.serviceName,
          merged.uuid,
          merged.password,
          merged.method,
          merged.realityPublicKey,
          merged.realityShortId,
          merged.fingerprint,
          merged.allowInsecure ? 1 : 0,
          merged.status,
          merged.sortOrder,
          Math.floor(Date.now() / 1000),
        )
        .first<BackendRow>();
      if (!row) throw new NotFoundError("Backend");
      return mapRow(row);
    },

    async delete(id) {
      await db.prepare("DELETE FROM backends WHERE id = ?1").bind(id).run();
    },
  };
}
