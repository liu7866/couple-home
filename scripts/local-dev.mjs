import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import './sites-env.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
if (!existsSync('node_modules/wrangler/bin/wrangler.js')) {
  console.error('请先在项目目录运行 pnpm install --frozen-lockfile');
  process.exit(1);
}
if (!existsSync('.dev.vars')) {
  writeFileSync('.dev.vars', 'OWNER_LOGIN_EMAIL=seedy@sites.test\n', { flag: 'wx' });
}
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler'))('miniflare');
const mf = new Miniflare({ modules: true,
  script: 'export default {fetch(){return new Response("local")}}',
  compatibilityDate: '2026-05-15',
  d1Databases: { DB: '00000000-0000-4000-8000-000000000000' },
  d1Persist: resolve('.wrangler/state/v3/d1'),
});
try {
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
  for (const file of readdirSync('drizzle').filter(x => x.endsWith('.sql')).sort()) {
    if (await db.prepare('SELECT name FROM d1_migrations WHERE name=?').bind(file).first()) continue;
    const statements = readFileSync(resolve('drizzle', file), 'utf8')
      .split('--> statement-breakpoint').map(x => x.trim()).filter(Boolean);
    await db.batch([...statements.map(sql => db.prepare(sql)),
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(file)]);
  }
} finally { await mf.dispose(); }
console.log('本地数据库已就绪。');
process.argv = [process.execPath, 'scripts/run-framework.mjs', 'dev', '--host', '127.0.0.1'];
await import('./run-framework.mjs');
