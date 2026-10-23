import { context, snapshot, json, fail, requireSameOrigin } from '../../../lib/home-server';
import { HomeError } from '../../../lib/home-domain.mjs';
import { applyStoredOperation } from '../../../lib/home-repository.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{return json(await snapshot(await context()))}catch(e){return fail(e)}}
export async function POST(req:Request){
  try{
    requireSameOrigin(req);const c=await context();
    if(Number(req.headers.get('content-length')||0)>2*1024*1024)throw new HomeError('内容太大，请分批导入。',413);
    const raw=await req.text();if(raw.length>2*1024*1024)throw new HomeError('内容太大，请分批导入。',413);
    let op;try{op=JSON.parse(raw)}catch{throw new HomeError('请求内容无效。')}
    if(typeof op.id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(op.id))throw new HomeError('操作编号无效。');
    await applyStoredOperation(c.db,op,c.member,c.now);
    return json(await snapshot(c));
  }catch(e){return fail(e)}
}
