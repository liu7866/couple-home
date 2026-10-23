import { context, fail, json, requireSameOrigin } from '../../../../lib/home-server';
import { HomeError } from '../../../../lib/home-domain.mjs';
export const dynamic='force-dynamic';
type Params={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Params){try{
  const c=await context(),{id}=await params;
  const p=await c.db.prepare('SELECT object_key FROM photos WHERE id=?').bind(id).first<{object_key:string}>();if(!p)throw new HomeError('照片不存在。',404);
  const object=await c.bucket.get(p.object_key);if(!object)throw new HomeError('照片暂时无法读取。',404);
  return new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return fail(e)}}
export async function DELETE(req:Request,{params}:Params){try{
  requireSameOrigin(req);const c=await context(),{id}=await params;
  const p=await c.db.prepare('SELECT object_key FROM photos WHERE id=?').bind(id).first<{object_key:string}>();if(!p)throw new HomeError('照片已被移除。',404);
  await c.db.prepare('DELETE FROM photos WHERE id=?').bind(id).run();await c.bucket.delete(p.object_key);return json({ok:true});
}catch(e){return fail(e)}}
