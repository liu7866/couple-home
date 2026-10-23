import { requireNativeOwner } from '../../../lib/home-auth';
import { context, json, fail } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
export const dynamic='force-dynamic';
// Archival access is deliberately separate from the time-sealed reading API.
// Only the pinned owner can archive unopened letters; no authentication tables leave D1.
export async function GET(){try{
 await requireNativeOwner();const c=await context();
 const [room,photos]=await c.db.batch([
  c.db.prepare('SELECT data,revision,updated_at FROM room_state WHERE id=1'),
  c.db.prepare('SELECT id,caption,created_at FROM photos ORDER BY created_at'),
 ]);
 const row=room.results[0] as {data:string,revision:number,updated_at:number}|undefined;
 if(!row)throw new HomeError('小屋正在准备，请重试。',503);
 const state=JSON.parse(row.data);delete state.pet?.cooldowns;
 return json({state:{...state,photos:photos.results},revision:row.revision,updatedAt:row.updated_at,exportedAt:new Date().toISOString()});
}catch(e){return fail(e)}}
