/// <reference types="@cloudflare/workers-types" />

import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Real-SQLite D1 shim for route tests.
 *
 * The first-generation fake pattern-matched SQL text, which drifted with
 * every new statement (its own docstring said to swap it for SQLite when
 * that became painful — five more repositories made it painful). This
 * adapter runs the actual migration files from database/migrations in an
 * in-memory database, so tests exercise the same SQL that D1 executes.
 *
 * Only the D1 surface the repositories use is implemented:
 * prepare(sql).bind(...params) → first() | all() | run().
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

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../database/migrations");

function applyMigrations(db: DatabaseSync): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    db.exec(readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8"));
  }
}

/** D1 stores booleans as INTEGER; node:sqlite rejects JS booleans. */
function coerceParam(value: unknown): string | number | bigint | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  throw new TypeError(`Unsupported D1 bind parameter: ${typeof value}`);
}

export function createSqliteD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  applyMigrations(db);

  const d1 = {
    prepare(sql: string): Statement {
      const statement = db.prepare(sql);
      let bound: unknown[] = [];
      const d1Statement: Statement = {
        bind(...params: unknown[]) {
          bound = params;
          return d1Statement;
        },
        async first<T = Row>(): Promise<T | null> {
          return (statement.get(...bound.map(coerceParam)) as T | undefined) ?? null;
        },
        async all<T = Row>(): Promise<{ results: T[] }> {
          return { results: statement.all(...bound.map(coerceParam)) as T[] };
        },
        async run() {
          const info = statement.run(...bound.map(coerceParam));
          return { meta: { changes: Number(info.changes) } };
        },
      };
      return d1Statement;
    },
  };

  return d1 as unknown as D1Database;
}
