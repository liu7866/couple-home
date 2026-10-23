import {requireNativeOwner} from '../../../lib/home-auth';
import {context,json,fail,requireSameOrigin,snapshot} from '../../../lib/home-server';
import {restoreState,HomeError} from '../../../lib/home-domain.mjs';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 requireSameOrigin(req);await requireNativeOwner();const c=await context(),raw=await req.text();if(raw.length>2*1024*1024)throw new HomeError('文字备份过大。',413);let p;try{p=JSON.parse(raw)}catch{throw new HomeError('请选择有效的 JSON 备份。')}
 if(!p||typeof p!=='object'||p.confirmation!=='恢复小屋'||!Number.isInteger(p.expectedRevision))throw new HomeError('请预览备份并确认恢复。');
 const state=restoreState(p.data,c.member,c.now),result=await c.db.prepare('UPDATE room_state SET data=?,revision=revision+1,updated_at=? WHERE id=1 AND revision=?').bind(JSON.stringify(state),c.now,p.expectedRevision).run();if(result.meta.changes!==1)throw new HomeError('预览后另一台设备更新了小屋，请重新预览，尚未覆盖文字或宠物。',409);
 return json(await snapshot(c));
}catch(e){return fail(e)}}
