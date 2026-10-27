import { env } from 'cloudflare:workers';
import { context, json, fail, requireSameOrigin, parseObject } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
import { albumAIConfig, albumAIStatus, analyzePhoto } from '../../../lib/album-ai.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await albumAIStatus(await context(),albumAIConfig(env)))}catch(e){return fail(e)}}
export async function POST(req:Request){try{
  requireSameOrigin(req);const c=await context();
  const raw=await req.text();if(raw.length>2000)throw new HomeError('整理请求过长。',413);
  return json(await analyzePhoto(c,albumAIConfig(env),parseObject(raw)));
}catch(e){return fail(e)}}
export async function DELETE(req:Request){try{
  requireSameOrigin(req);const c=await context();if(!c.canManagePasswords)throw new HomeError('请管理员清除整理结果。',403);
  await c.db.batch([c.db.prepare('DELETE FROM photo_ai_jobs'),c.db.prepare('DELETE FROM photo_ai')]);
  return json({ok:true});
}catch(e){return fail(e)}}
