import {env} from 'cloudflare:workers';
import {requireNativeOwner,hashToken,randomToken} from '../../../lib/home-auth';
import {json,fail,requireSameOrigin} from '../../../lib/home-server';
import {HomeError} from '../../../lib/home-domain.mjs';
import {createPassword} from '../../../lib/password.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 requireSameOrigin(req);const db=env.DB;if(!db)throw new HomeError('云端正在准备。',503);await requireNativeOwner();const raw=await req.text();if(raw.length>2000)throw new HomeError('内容太长。');const body=JSON.parse(raw);
 if(![1,2].includes(body.slot))throw new HomeError('请选择成员。');
 const member=await db.prepare('SELECT user_id FROM member_passwords WHERE slot=?').bind(body.slot).first();if(!member)throw new HomeError('请先为这位成员设置密码。');
 const code=randomToken();await db.prepare('INSERT INTO recovery_codes (slot,code_hash,created_at) VALUES (?,?,?) ON CONFLICT(slot) DO UPDATE SET code_hash=excluded.code_hash,created_at=excluded.created_at').bind(body.slot,await hashToken(code),Date.now()).run();return json({code,slot:body.slot});
}catch(e){return fail(e)}}
export async function PUT(req:Request){try{
 requireSameOrigin(req);const db=env.DB;if(!db)throw new HomeError('云端正在准备。',503);const raw=await req.text();if(raw.length>2000)throw new HomeError('内容太长。');const body=JSON.parse(raw);
 if(![1,2].includes(body.slot)||typeof body.code!=='string'||!/^[a-f0-9]{64}$/.test(body.code.trim()))throw new HomeError('身份或恢复码不正确。',401);
 const now=Date.now(),ip=await hashToken('recovery:'+(req.headers.get('cf-connecting-ip')||'unknown'));
 await db.prepare('INSERT INTO auth_attempts (ip_hash,count,expires_at) VALUES (?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END').bind(ip,now+600000,now,now,now+600000).run();
 const attempts=await db.prepare('SELECT count FROM auth_attempts WHERE ip_hash=?').bind(ip).first<{count:number}>();if((attempts?.count||0)>5)throw new HomeError('尝试过于频繁，10 分钟后再试。',429);
 const hash=await hashToken(body.code.trim()),row=await db.prepare('SELECT slot FROM recovery_codes WHERE slot=? AND code_hash=?').bind(body.slot,hash).first();if(!row)throw new HomeError('身份或恢复码不正确，旧恢复码使用后会失效。',401);
 const password=await createPassword(body.password),nextCode=randomToken();
 const result=await db.batch([
 db.prepare('UPDATE member_passwords SET salt=?,password_hash=?,version=?,created_at=? WHERE slot=? AND EXISTS (SELECT 1 FROM recovery_codes WHERE slot=? AND code_hash=?)').bind(password.salt,password.passwordHash,password.version,now,body.slot,body.slot,hash),
 db.prepare('DELETE FROM home_sessions WHERE user_id IN (SELECT user_id FROM member_passwords WHERE slot=? AND version=?)').bind(body.slot,password.version),
 db.prepare('UPDATE recovery_codes SET code_hash=?,created_at=? WHERE slot=? AND code_hash=?').bind(await hashToken(nextCode),now,body.slot,hash),
 ]);if(result[0].meta.changes!==1)throw new HomeError('恢复码已使用，请使用新的恢复码。',409);
 await db.prepare('DELETE FROM auth_attempts WHERE ip_hash=?').bind(ip).run();return json({ok:true,code:nextCode});
}catch(e){return fail(e)}}
