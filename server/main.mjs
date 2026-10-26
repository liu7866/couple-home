import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.mjs';

process.umask(0o077);
const root = fileURLToPath(new URL('./', import.meta.url));
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 无效。');
const app = createApplication({ root, dataDir: resolve(process.env.DATA_DIR || resolve(root, 'data')),
  origin: process.env.APP_ORIGIN || `http://127.0.0.1:${port}`, trustProxy: process.env.TRUST_PROXY === '1', setupCode: process.env.SETUP_CODE });
app.server.listen(port, host, () => {
  if (new URL(app.env.APP_ORIGIN).port === '0') {
    const url = new URL(app.env.APP_ORIGIN); url.port = String(app.server.address().port); app.env.APP_ORIGIN = url.origin;
  }
  console.log(`我们的小日子已启动：${app.env.APP_ORIGIN}`);
  if (!app.db.raw.prepare('SELECT 1 FROM member_passwords LIMIT 1').get()) {
    console.log('首次使用：在网页中设置两位成员的密码，成员一拥有管理员权限。');
    if (app.setupCode) console.log('小屋初始化码（请私下交给创建者）：' + app.setupCode);
  }
});
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 15000); deadline.unref();
  try { await app.close(); clearTimeout(deadline); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
app.server.on('error', error => { console.error('服务启动失败：', error.message); app.db.close(); process.exitCode = 1; });
