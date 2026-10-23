import { env } from 'cloudflare:workers';
import { homeIdentity } from './home-auth';
import { publicState, HomeError } from './home-domain.mjs';
import { ensureMember } from './home-repository.mjs';
import { matchesPagesOrigin } from './pages-origin';

export function json(data: unknown, status=200) { return Response.json(data, {status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}}); }
export function fail(e: unknown) {
  if(e instanceof HomeError) return json({error:e.message}, e.status);
  console.error('Home request failed',e instanceof Error?e.message:'unknown');
  return json({error:'小屋暂时没有连接上，请稍后重试。'},503);
}
export function requireSameOrigin(req: Request) {
  const origin=req.headers.get('origin');
  if(!origin||(origin!==new URL(req.url).origin&&!matchesPagesOrigin(origin,env.PAGES_ORIGIN)))throw new HomeError('请从小屋页面执行这个操作。',403);
}
export async function context() {
  const identity=await homeIdentity(),u=identity.user;
  if(!env.DB||!env.BUCKET)throw new HomeError('云端空间正在准备，请稍后重试。',503);
  const db=env.DB, now=Date.now();
  // Only the pinned owner or a valid home-key session can reach shared records.
  const member=await ensureMember(db,u,now);
  return {db,bucket:env.BUCKET,member,now,canManagePasswords:identity.nativeOwner,loginMethod:identity.loginMethod};
}
export async function snapshot(c: Awaited<ReturnType<typeof context>>) {
  const room=await c.db.prepare('SELECT data,revision,updated_at FROM room_state WHERE id=1').first<{data:string,revision:number,updated_at:number}>();
  if(!room)throw new HomeError('小屋正在准备，请重试。',503);
  const list=await c.db.prepare('SELECT slot, last_seen FROM members ORDER BY slot').all<{slot:number,last_seen:number}>();
  const photos=await c.db.prepare('SELECT id,caption,created_at FROM photos ORDER BY created_at').all<{id:string,caption:string,created_at:number}>();
  return {state:{...publicState(JSON.parse(room.data),Date.now()),photos:photos.results.map(p=>({id:p.id,caption:p.caption,url:'/api/photos/'+p.id}))},revision:room.revision,updatedAt:room.updated_at,me:{slot:c.member.slot,canManagePasswords:c.canManagePasswords,loginMethod:c.loginMethod},members:list.results.map(m=>({slot:m.slot,online:Date.now()-m.last_seen<60000,joined:m.last_seen>0}))};
}
