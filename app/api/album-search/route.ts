import { env } from 'cloudflare:workers';
import { context, json, fail, requireSameOrigin, parseObject } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
import { albumAIConfig, semanticSearch } from '../../../lib/album-ai.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
  requireSameOrigin(req);const c=await context(),raw=await req.text();if(raw.length>2000)throw new HomeError('搜索请求过长。',413);
  return json(await semanticSearch(c,albumAIConfig(env),parseObject(raw)));
}catch(e){return fail(e)}}
