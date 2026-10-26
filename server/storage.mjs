import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { readFile, open, rename, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// The existing repositories use the small D1 prepare/bind/batch interface.
export function openDatabase(dataDir, migrationsDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const raw = new DatabaseSync(resolve(dataDir, 'home.sqlite'));
  try {
    raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL)');
    for (const name of readdirSync(migrationsDir).filter(x => x.endsWith('.sql')).sort()) {
      const sql = readFileSync(resolve(migrationsDir, name), 'utf8');
      const hash = createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex');
      const applied = raw.prepare('SELECT sha256 FROM schema_migrations WHERE name=?').get(name);
      if (applied) {
        if (applied.sha256 !== hash) throw new Error(`已应用的数据库迁移被修改：${name}`);
        continue;
      }
      transaction(() => {
        raw.exec(sql);
        raw.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, hash);
      });
    }
    raw.exec("CREATE TABLE IF NOT EXISTS identity_names (slot INTEGER PRIMARY KEY CHECK(slot IN (1,2)), name TEXT NOT NULL); INSERT OR IGNORE INTO identity_names VALUES (1,'成员一'),(2,'成员二');");
    return { raw, prepare, batch, transaction, close: () => raw.close() };
  } catch (error) { raw.close(); throw error; }

  function transaction(fn) {
    raw.exec('BEGIN IMMEDIATE');
    try { const result = fn(); raw.exec('COMMIT'); return result; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  }
  function prepare(sql, values = []) {
    const statement = raw.prepare(sql);
    function execute() {
      if (statement.columns().length) return { results: statement.all(...values), success: true, meta: { changes: 0 } };
      const result = statement.run(...values);
      return { results: [], success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
    return {
      bind: (...parameters) => prepare(sql, parameters),
      first: async column => {
        const row = statement.get(...values);
        return row ? (column ? row[column] : row) : null;
      },
      all: async () => execute(), run: async () => execute(), execute,
    };
  }
  async function batch(statements) { return transaction(() => statements.map(statement => statement.execute())); }
}

export function photoPath(root, key) {
  if (typeof key !== 'string' || !/^photos\/(?:[a-f0-9]{8}-[a-f0-9-]{27}|import-[a-f0-9]{64})$/.test(key)) {
    throw new Error('无效的照片存储键');
  }
  return resolve(root, key);
}

export function localBucket(root) {
  return {
    async put(key, bytes) {
      const destination = photoPath(root, key);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      const temp = destination + '.' + randomUUID() + '.tmp';
      try {
        const handle = await open(temp, 'wx', 0o600);
        try { await handle.writeFile(Buffer.from(bytes)); await handle.sync(); }
        finally { await handle.close(); }
        await rename(temp, destination);
      } finally { await rm(temp, { force: true }); }
    },
    async get(key) {
      try { return { body: await readFile(photoPath(root, key)) }; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async delete(key) { await rm(photoPath(root, key), { force: true }); },
  };
}
