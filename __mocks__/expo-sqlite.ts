/**
 * Manual mock for `expo-sqlite`, backed by an in-memory `better-sqlite3`
 * database so the data layer's real SQL runs in Node during tests.
 *
 * Jest applies this automatically for any `import ... from 'expo-sqlite'`
 * because it lives in the root `__mocks__/` folder adjacent to node_modules.
 *
 * Only the async surface the app actually uses is implemented:
 * `openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`,
 * `getFirstAsync`, `withTransactionAsync`.
 */
import Database from 'better-sqlite3';

type Params = unknown[];

function flatten(params: Params): unknown[] {
  // expo-sqlite accepts either rest args or a single array; normalize both.
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

function wrap(raw: Database.Database) {
  return {
    async execAsync(sql: string): Promise<void> {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...params: Params) {
      const info = raw.prepare(sql).run(...flatten(params));
      return {
        lastInsertRowId: Number(info.lastInsertRowid),
        changes: info.changes,
      };
    },
    async getAllAsync<T>(sql: string, ...params: Params): Promise<T[]> {
      return raw.prepare(sql).all(...flatten(params)) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null> {
      const row = raw.prepare(sql).get(...flatten(params));
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    closeSync() {
      raw.close();
    },
  };
}

// Names that have been pre-seeded (e.g. with a legacy schema) and must persist
// across opens so migration code can run against the seeded data. Anything not
// in this map gets a fresh DB per open, preserving the clean-slate default that
// the rest of the suite relies on.
const seeded = new Map<string, Database.Database>();

/**
 * Test seam: install a connection for `name` and return the raw better-sqlite3
 * handle so a test can create a legacy schema on it before the app opens it.
 * Subsequent `openDatabaseAsync(name)` calls reuse this same connection.
 */
export function __seedDb(name: string): Database.Database {
  const raw = new Database(':memory:');
  seeded.set(name, raw);
  return raw;
}

/** Test seam: drop all seeded connections (call between tests). */
export function __resetDbs() {
  for (const raw of seeded.values()) raw.close();
  seeded.clear();
}

/**
 * A fresh in-memory DB on every open, so each module re-import starts clean —
 * unless the name was pre-seeded via `__seedDb`, in which case the seeded
 * connection is reused so migrations run against the existing data.
 */
export async function openDatabaseAsync(name: string) {
  const existing = seeded.get(name);
  return wrap(existing ?? new Database(':memory:'));
}

export default { openDatabaseAsync };
