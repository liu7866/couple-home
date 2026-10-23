import { env } from 'cloudflare:workers';
import { json, fail, requireSameOrigin } from '../../../lib/home-server';
import { hashToken, randomToken, sessionCookie, cookieToken, SESSION_MS } from '../../../lib/home-auth';
import { HomeError } from '../../../lib/home-domain.mjs';
import { verifyPassword } from '../../../lib/password.mjs';
import { matchesPagesOrigin, bearerToken } from '../../../lib/pages-origin';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  requireSameOrigin(req);if(!env.DB)throw new HomeError('云端正在准备。',503);
  const db=env.DB,now=Date.now(),ipHash=await hashToken(req.headers.get('cf-connecting-ip')||'unknown');
  await db.prepare('INSERT INTO auth_attempts (ip_hash,count,expires_at) VALUES (?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END').bind(ipHash,now+10*60000,now,now,now+10*60000).run();
  const attempt=await db.prepare('SELECT count FROM auth_attempts WHERE ip_hash=?').bind(ipHash).first<{count:number}>();
  if((attempt?.count||0)>10)throw new HomeError('试得有些频繁，10 分钟后再来吧。',429);
  const raw=await req.text();if(raw.length>2000)throw new HomeError('登录内容太长。');
  let body;try{body=JSON.parse(raw)}catch{throw new HomeError('请填写登录密码。')}
  if(![1,2].includes(body.slot)||typeof body.password!=='string'||body.password.length>128)throw new HomeError('请选择身份并输入正确的密码。',401);
  const record=await db.prepare('SELECT user_id,slot,salt,password_hash,version FROM member_passwords WHERE slot=?').bind(body.slot).first<{user_id:string,slot:number,salt:string,password_hash:string,version:string}>();
  const verified=await verifyPassword(body.password,record);
  if(!record||!verified)throw new HomeError('密码尚未设置或不正确，请确认身份和密码。',401);
  const pages=matchesPagesOrigin(req.headers.get('origin'),env.PAGES_ORIGIN);
  const token=randomToken();await db.prepare('INSERT INTO home_sessions (token_hash,key_hash,user_id,expires_at) VALUES (?,?,?,?)').bind(await hashToken(token),record.version,record.user_id,now+(body.remember===true?SESSION_MS:12*3600e3)).run();
  await db.prepare('DELETE FROM auth_attempts WHERE ip_hash=?').bind(ipHash).run();
  return Response.json({ok:true,slot:record.slot,...(pages?{token,expiresAt:now+(body.remember===true?SESSION_MS:12*3600e3)}:{})},{headers:{...(!pages?{'Set-Cookie':body.remember===true?sessionCookie(token):sessionCookie(token).replace(/; Max-Age=\d+/, '')}:{}),'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
export async function DELETE(req:Request){try{
  requireSameOrigin(req);const raw=cookieToken(req.headers.get('cookie'))||(matchesPagesOrigin(req.headers.get('origin'),env.PAGES_ORIGIN)?bearerToken(req.headers.get('authorization')):null);
  if(raw&&env.DB)await env.DB.prepare('DELETE FROM home_sessions WHERE token_hash=?').bind(await hashToken(raw)).run();
  return Response.json({ok:true},{headers:{'Set-Cookie':sessionCookie('',0),'Cache-Control':'no-store'}});
}catch(e){return fail(e)}}
