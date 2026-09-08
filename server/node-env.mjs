import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";

// Preserve the existing prepared SQL and D1 result shape on Node without
// rewriting the monitoring, removal, restore, or import workflows.
export function openDatabase(filename) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  function prepare(sql, values = []) {
    return {
      bind(...args) { return prepare(sql, args); },
      execute() {
        const statement = sqlite.prepare(sql);
        if (statement.columns().length) {
          return { success: true, results: statement.all(...values), meta: { changes: 0 } };
        }
        const result = statement.run(...values);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
      async all() { return this.execute(); },
      async run() { return this.execute(); },
      async first(column) {
        const row = sqlite.prepare(sql).get(...values);
        return row ? (column ? row[column] : row) : null;
      },
    };
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(statement => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close() { sqlite.close(); },
  };
}

let database;
export const env = {
  get DB() {
    const filename = process.env.DATABASE_PATH || `${homedir()}/url-monitor-data/url-monitor.sqlite`;
    if (!isAbsolute(filename)) {
      throw new Error("DATABASE_PATH must be an absolute persistent path outside the deployment and public directories.");
    }
    return database ??= openDatabase(filename);
  },
};
