import { randomBytes, createHash } from 'node:crypto';
import { currentRequest } from './request-context.mjs';
import { HomeError } from '../lib/home-domain.mjs';

export const SESSION_MS = 30 * 86400000;
export const randomToken = () => randomBytes(32).toString('hex');
export const hashToken = async value => createHash('sha256').update(value).digest('hex');
function cookieName() { return currentRequest().env.APP_ORIGIN.startsWith('https:') ? '__Host-little_days' : 'little_days_local'; }
export function cookieToken(cookie) {
  const name = cookieName();
  const value = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export function sessionCookie(token, maxAge = SESSION_MS / 1000) {
  const secure = currentRequest().env.APP_ORIGIN.startsWith('https:');
  return `${cookieName()}=${token}; Path=/; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${maxAge}`;
}
export async function homeIdentity() {
  const { request, env } = currentRequest();
  const raw = cookieToken(request.headers.get('cookie'));
  if (!raw) throw new HomeError('选择你的身份，输入密码就能回家。', 401);
  const session = await env.DB.prepare('SELECT s.user_id,m.display_name,m.slot FROM home_sessions s JOIN member_passwords p ON p.version=s.key_hash AND p.user_id=s.user_id JOIN members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?')
    .bind(await hashToken(raw), Date.now()).first();
  if (!session) throw new HomeError('登录已过期或密码已修改，请重新登录。', 401);
  return { user: { userId: session.user_id, displayName: session.display_name }, nativeOwner: session.slot === 1, loginMethod: 'password' };
}
export async function nativeOwner() {
  try { const identity = await homeIdentity(); return identity.nativeOwner ? identity.user : null; }
  catch (error) { if (error instanceof HomeError && error.status === 401) return null; throw error; }
}
export async function requireNativeOwner() {
  const owner = await nativeOwner();
  if (!owner) throw new HomeError('请管理员使用第一位成员的密码登录后操作。', 403);
  return owner;
}
