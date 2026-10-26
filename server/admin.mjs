import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './storage.mjs';
import { initializeHome, resetPassword } from './administration.mjs';

process.umask(0o077);
const root = fileURLToPath(new URL('./', import.meta.url));
const [command, option] = process.argv.slice(2);
let db, terminal;
try {
  if (!['init', 'reset-password'].includes(command)) throw new Error('用法：node admin.mjs init 或 node admin.mjs reset-password；自动化输入可加 --stdin（JSON）。');
  let input;
  if (option === '--stdin') {
    let text = '';
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 4096) throw new Error('输入内容过长。'); }
    input = JSON.parse(text);
  } else {
    if (option || !process.stdin.isTTY) throw new Error('请在交互式终端运行；自动化输入请明确使用 --stdin。');
    let hidden = false;
    const output = new Writable({ write(chunk, _encoding, done) { if (!hidden) process.stdout.write(chunk); done(); } });
    terminal = createInterface({ input: process.stdin, output, terminal: true });
    const ask = async (label, secret = false) => {
      process.stdout.write(label); hidden = secret;
      try { return await terminal.question(''); }
      finally { hidden = false; if (secret) process.stdout.write('\n'); }
    };
    const password = async label => {
      const first = await ask(label, true), confirmation = await ask('再输入一次密码：', true);
      if (first !== confirmation) throw new Error('两次密码不一致。');
      return first;
    };
    input = command === 'init'
      ? { names: [await ask('第一位成员名字（管理员）：'), await ask('第二位成员名字：')],
        passwords: [await password('第一位成员密码（6 至 128 个字符）：'), await password('第二位成员密码：')] }
      : { slot: Number(await ask('需要重设的成员编号（1 或 2）：')), password: await password('新密码（6 至 128 个字符）：') };
  }
  db = openDatabase(resolve(process.env.DATA_DIR || resolve(root, 'data')), resolve(root, 'drizzle'));
  if (command === 'init') await initializeHome(db, input.names, input.passwords);
  else await resetPassword(db, input.slot, input.password);
  console.log(command === 'init' ? '小屋账号已创建。第一位成员拥有管理权限，请分别使用各自密码登录。' : '密码已重设，这位成员的旧会话和恢复码已失效。');
} catch (error) { console.error(error instanceof SyntaxError ? '请输入有效的 JSON。' : error.message); process.exitCode = 1; }
finally { terminal?.close(); db?.close(); }
