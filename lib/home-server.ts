import { env } from 'cloudflare:workers';
import { homeIdentity } from './home-auth';
import { publicState, HomeError } from './home-domain.mjs';
import { ensureMember } from './home-repository.mjs';
import { matchesPagesOrigin } from './pages-origin';
import { homeSyncTag } from './home-sync-tag.mjs';
import { publicPhotoAI } from './album-ai.mjs';

export function json(data: unknown, status=200) { return Response.json(data, {status,headers:{'Cache-Control':'no-store','Vary':'Cookie'}}); }
export function parseObject(raw:string, message='请求内容无效。') {
  let value;try{value=JSON.parse(raw)}catch{throw new HomeError(message);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HomeError(message);
  return value;
}
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
  const [room,list,photos]=await Promise.all([
    c.db.prepare('SELECT data,revision,updated_at FROM room_state WHERE id=1').first<{data:string,revision:number,updated_at:number}>(),
    c.db.prepare('SELECT slot, last_seen FROM members ORDER BY slot').all<{slot:number,last_seen:number}>(),
    c.db.prepare('SELECT p.id,p.caption,p.created_at,a.description AS ai_description,a.tags AS ai_tags,a.category AS ai_category,a.updated_at AS ai_updated_at FROM photos p LEFT JOIN photo_ai a ON a.photo_id=p.id ORDER BY p.created_at').all<{id:string,caption:string,created_at:number}>(),
  ]);
  if(!room)throw new HomeError('小屋正在准备，请重试。',503);
  return {syncTag:await homeSyncTag(room.revision,photos.results,[c.member.slot,c.canManagePasswords,c.loginMethod]),state:{...publicState(JSON.parse(room.data),Date.now(),c.member.slot),photos:photos.results.map(p=>({id:p.id,caption:p.caption,created_at:p.created_at,url:'/api/photos/'+p.id,ai:publicPhotoAI(p)}))},revision:room.revision,updatedAt:room.updated_at,me:{slot:c.member.slot,canManagePasswords:c.canManagePasswords,loginMethod:c.loginMethod},members:list.results.map(m=>({slot:m.slot,online:Date.now()-m.last_seen<60000,joined:m.last_seen>0}))};
}
