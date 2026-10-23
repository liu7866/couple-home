import { env } from 'cloudflare:workers';
import { requireNativeOwner } from '../../../lib/home-auth';
import { ensureMember } from '../../../lib/home-repository.mjs';
import { json, fail, requireSameOrigin } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
import { createPassword } from '../../../lib/password.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{
  await requireNativeOwner();if(!env.DB)throw new HomeError('云端正在准备。',503);
  const passwords=await env.DB.prepare('SELECT slot,created_at FROM member_passwords ORDER BY slot').all();return json({passwords:passwords.results});
}catch(e){return fail(e)}}
export async function POST(req:Request){try{
  requireSameOrigin(req);const owner=await requireNativeOwner();if(!env.DB)throw new HomeError('云端正在准备。',503);
  const db=env.DB,now=Date.now();await ensureMember(db,owner,now);
  const raw=await req.text();if(raw.length>2000)throw new HomeError('密码内容太长。');
  let body;try{body=JSON.parse(raw)}catch{throw new HomeError('请填写要设置的密码。')}
  if(![1,2].includes(body.slot))throw new HomeError('请选择小屋成员。');
  const password=await createPassword(body.password);
  let target=await db.prepare('SELECT user_id FROM members WHERE slot=?').bind(body.slot).first<{user_id:string}>();
  if(!target){
    const id='passworduser_'+crypto.randomUUID();
    await db.prepare('INSERT OR IGNORE INTO members (user_id,slot,display_name,last_seen) VALUES (?,?,?,0)').bind(id,body.slot,'小屋成员').run();
    target=await db.prepare('SELECT user_id FROM members WHERE slot=?').bind(body.slot).first();
  }
  if(!target)throw new HomeError('密码暂时没有设置成功，请重试。',503);
  await db.batch([
    db.prepare('DELETE FROM recovery_codes WHERE slot=?').bind(body.slot),
    db.prepare('DELETE FROM home_sessions WHERE user_id=?').bind(target.user_id),
    db.prepare('INSERT INTO member_passwords (slot,user_id,salt,password_hash,version,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,version=excluded.version,created_at=excluded.created_at').bind(body.slot,target.user_id,password.salt,password.passwordHash,password.version,now),
  ]);
  return json({ok:true,slot:body.slot});
}catch(e){return fail(e)}}
