import { randomBytes, pbkdf2, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HomeError } from '../lib/home-domain.mjs';

const derive = promisify(pbkdf2);
export const PASSWORD_ITERATIONS = 600000;
export async function createPassword(password) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    throw new HomeError('密码请设置为 6 至 128 个字符。');
  }
  const salt = randomBytes(32).toString('hex');
  return { salt, passwordHash: (await derive(password, Buffer.from(salt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256')).toString('hex'),
    version: randomBytes(32).toString('hex') };
}
export async function verifyPassword(password, record) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) return false;
  const actual = await derive(password, Buffer.from(record?.salt || '0'.repeat(64), 'hex'), PASSWORD_ITERATIONS, 32, 'sha256');
  const expected = Buffer.from(record?.password_hash || '0'.repeat(64), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual) && !!record;
}
