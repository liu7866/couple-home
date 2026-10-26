import { env } from 'cloudflare:workers';
import { headers } from 'next/headers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { HomeError } from './home-domain.mjs';
import { matchesPagesOrigin, bearerToken } from './pages-origin';

export const SESSION_COOKIE='__Host-little_days';
export const SESSION_MS=30*86400000;
export function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')}
export async function hashToken(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')}
export async function nativeOwner(){
  if(!env.OWNER_LOGIN_EMAIL)throw new HomeError('小屋管理员身份尚未配置。',503);
  const user=await getChatGPTUser();
  return user?.email.toLowerCase()===env.OWNER_LOGIN_EMAIL.toLowerCase()?user:null;
}
export async function requireNativeOwner(){const owner=await nativeOwner();if(!owner)throw new HomeError('请管理员使用原来的 ChatGPT 账号登录后设置密码。',403);return owner}
export function cookieToken(cookie:string|null){const value=cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:null}
export function cookieTokens(cookie:string|null){const token=cookieToken(cookie);return token?[token]:[]}
export async function homeIdentity(){
  const owner=await nativeOwner();
  if(owner)return{user:owner,nativeOwner:true,loginMethod:'chatgpt'};
  const h=await headers(),raw=cookieToken(h.get('cookie'))||(matchesPagesOrigin(h.get('origin'),env.PAGES_ORIGIN)?bearerToken(h.get('authorization')):null);
  if(!raw||!env.DB)throw new HomeError('选择你的身份，输入密码就能回家。',401);
  const session=await env.DB.prepare('SELECT s.user_id,m.display_name FROM home_sessions s JOIN member_passwords p ON p.version=s.key_hash AND p.user_id=s.user_id JOIN members m ON m.user_id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await hashToken(raw),Date.now()).first<{user_id:string,display_name:string}>();
  if(!session)throw new HomeError('登录已过期或密码已修改，请重新登录。',401);
  return{user:{userId:session.user_id,displayName:session.display_name},nativeOwner:false,loginMethod:'password'};
}
export function sessionCookie(token:string,maxAge=SESSION_MS/1000){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`}
export function clearSessionCookies(){return [sessionCookie('',0)]}
