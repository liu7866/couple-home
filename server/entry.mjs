import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeHome } from './administration.mjs';
import { requireNativeOwner } from './auth.mjs';
import { HomeError } from '../lib/home-domain.mjs';

export function identityNames(db) {
  return db.raw.prepare('SELECT name FROM identity_names ORDER BY slot').all().map(row => row.name);
}

export function createEntry({ db, dataDir, origin, setupCode }) {
  const local = new URL(origin).protocol === 'http:';
  const empty = () => !db.raw.prepare('SELECT 1 FROM members LIMIT 1').get() && !db.raw.prepare('SELECT 1 FROM room_state LIMIT 1').get();
  let code = '', busy = false;
  if (!local && empty()) {
    if (setupCode) code = setupCode;
    else {
      const path = resolve(dataDir, '.setup-code');
      try { code = readFileSync(path, 'utf8').trim(); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        code = randomBytes(24).toString('hex');
        try { writeFileSync(path, code, { flag: 'wx', mode: 0o600 }); }
        catch (error) { if (error.code !== 'EEXIST') throw error; code = readFileSync(path, 'utf8').trim(); }
      }
    }
    if (typeof code !== 'string' || code.length < 24 || code.length > 128) throw new Error('初始化码需要 24 至 128 个字符。');
  }
  function sameOrigin(request) {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new HomeError('请从小屋页面执行这个操作。', 403);
  }
  async function readInput(request) {
    try { const value = await request.json(); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
    catch { throw new HomeError('请填写完整的设置内容。'); }
  }
  return {
    code,
    status: () => ({ setupRequired: empty(), requiresSetupCode: !local && empty(), identityNames: identityNames(db) }),
    async setup(request) {
      sameOrigin(request);
      if (!empty() || busy) throw new HomeError('小屋已经创建，请使用已有密码登录。', 409);
      const input = await readInput(request);
      if (!local) {
        const supplied = Buffer.from(typeof input.code === 'string' ? input.code.trim() : '');
        const expected = Buffer.from(code);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new HomeError('小屋初始化码不正确，请向部署者确认。', 403);
      }
      if (!Array.isArray(input.passwords) || !Array.isArray(input.confirmations) || input.passwords.length !== 2 || input.confirmations.length !== 2 || input.passwords.some((value, index) => value !== input.confirmations[index])) {
        throw new HomeError('请分别确认两位成员的密码，两次输入需要一致。');
      }
      if (!empty() || busy) throw new HomeError('小屋已经创建，请使用已有密码登录。', 409);
      busy = true;
      try { await initializeHome(db, ['成员一', '成员二'], input.passwords); }
      finally { busy = false; }
      return input.passwords[0];
    },
    async rename(request) {
      sameOrigin(request); await requireNativeOwner();
      const input = await readInput(request), names = input.identityNames;
      if (!Array.isArray(names) || names.length !== 2 || names.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 20 || /[\u0000-\u001f\u007f]/.test(value))) throw new HomeError('请填写两种身份的名称，每个名称为 1 至 20 个字符。');
      const normalized = names.map(value => value.trim());
      if (normalized[0] === normalized[1]) throw new HomeError('两种身份请使用不同的名称，方便登录时区分。');
      db.transaction(() => {
        normalized.forEach((name, index) => db.raw.prepare('UPDATE identity_names SET name=? WHERE slot=?').run(name, index + 1));
        db.raw.prepare('UPDATE room_state SET revision=revision+1,updated_at=? WHERE id=1').run(Date.now());
      });
      return { identityNames: normalized };
    },
  };
}
