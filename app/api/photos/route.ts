import { context, json, fail, requireSameOrigin } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  requireSameOrigin(req);const c=await context();
  if(Number(req.headers.get('content-length')||0)>5*1024*1024)throw new HomeError('请选择小于 5MB 的照片。',413);
  const body=await req.formData(),file=body.get('photo'),caption=String(body.get('caption')||'').trim().slice(0,80);
  if(!(file instanceof File)||file.size>4*1024*1024||file.size===0||file.type!=='image/jpeg')throw new HomeError('请选择可读取的照片。',400);
  const bytes=await file.arrayBuffer(),head=new Uint8Array(bytes,0,3);if(head[0]!==255||head[1]!==216||head[2]!==255)throw new HomeError('照片格式无效。');
  const count=await c.db.prepare('SELECT COUNT(*) AS n FROM photos').first<{n:number}>();if((count?.n||0)>=200)throw new HomeError('相册暂时最多支持 200 张照片。');
  let id=crypto.randomUUID(),exists=false;
  if(body.get('merge')==='1'){
    const digest=await crypto.subtle.digest('SHA-256',await new Blob([bytes,new TextEncoder().encode(caption)]).arrayBuffer());
    id='import-'+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
    exists=!!(await c.db.prepare('SELECT id FROM photos WHERE id=?').bind(id).first());
    if(exists)return json({id,caption,url:'/api/photos/'+id,existed:true});
  }
  const objectKey='photos/'+id;
  await c.bucket.put(objectKey,bytes,{httpMetadata:{contentType:'image/jpeg'}});
  try{await c.db.prepare('INSERT OR IGNORE INTO photos (id,object_key,caption,created_at,user_id) VALUES (?,?,?,?,?)').bind(id,objectKey,caption,c.now,c.member.userId).run()}catch(e){await c.bucket.delete(objectKey);throw e}
  return json({id,caption,url:'/api/photos/'+id});
}catch(e){return fail(e)}}
