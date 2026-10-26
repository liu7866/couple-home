import { randomUUID } from 'node:crypto';
import { createPassword } from './password.mjs';
import { initialState } from '../lib/home-domain.mjs';

export async function initializeHome(db, names, passwords) {
  if (!Array.isArray(names) || names.length !== 2 || names.some(x => typeof x !== 'string' || !x.trim() || x.trim().length > 15)) {
    throw new Error('请填写两位成员的名字，每个名字最多 15 个字符。');
  }
  if (!Array.isArray(passwords) || passwords.length !== 2) throw new Error('请分别设置两位成员的密码。');
  const hashes = await Promise.all(passwords.map(createPassword));
  const state = initialState(); state.names = names.map(x => x.trim());
  db.transaction(() => {
    if (db.raw.prepare('SELECT COUNT(*) AS n FROM members').get().n || db.raw.prepare('SELECT COUNT(*) AS n FROM room_state').get().n) {
      throw new Error('小屋已初始化，不能重复初始化或覆盖现有记录。需要重设密码时请使用 reset-password。');
    }
    hashes.forEach((password, index) => {
      const userId = randomUUID(), slot = index + 1;
      db.raw.prepare('INSERT INTO members (user_id,slot,display_name,last_seen) VALUES (?,?,?,0)').run(userId, slot, state.names[index]);
      db.raw.prepare('INSERT INTO member_passwords (slot,user_id,salt,password_hash,version,created_at) VALUES (?,?,?,?,?,?)')
        .run(slot, userId, password.salt, password.passwordHash, password.version, Date.now());
    });
    db.raw.prepare('INSERT INTO room_state (id,data,revision,updated_at) VALUES (1,?,0,?)').run(JSON.stringify(state), Date.now());
  });
}

export async function resetPassword(db, slot, value) {
  if (![1, 2].includes(slot)) throw new Error('成员编号只能是 1 或 2。');
  const password = await createPassword(value);
  db.transaction(() => {
    const target = db.raw.prepare('SELECT user_id FROM member_passwords WHERE slot=?').get(slot);
    if (!target) throw new Error('请先初始化小屋账号。');
    db.raw.prepare('UPDATE member_passwords SET salt=?,password_hash=?,version=?,created_at=? WHERE slot=?')
      .run(password.salt, password.passwordHash, password.version, Date.now(), slot);
    db.raw.prepare('DELETE FROM home_sessions WHERE user_id=?').run(target.user_id);
    db.raw.prepare('DELETE FROM recovery_codes WHERE slot=?').run(slot);
  });
}
