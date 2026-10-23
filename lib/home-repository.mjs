import { initialState, applyOperation, HomeError } from './home-domain.mjs';

export async function ensureMember(db,user,now=Date.now()) {
  const find=()=>db.prepare('SELECT user_id,slot,display_name,last_seen,EXISTS(SELECT 1 FROM room_state WHERE id=1) AS room_ready FROM members WHERE user_id=?').bind(user.userId).first();
  let member=await find();
  if(!member){
    await db.prepare('INSERT OR IGNORE INTO members (user_id,slot,display_name,last_seen) SELECT ?, CASE WHEN EXISTS (SELECT 1 FROM members WHERE slot=1) THEN 2 ELSE 1 END, ?, ? WHERE (SELECT COUNT(*) FROM members) < 2').bind(user.userId,user.displayName,now).run();
    member=await find();
  }
  if(!member)throw new HomeError('这个小屋已经住着两个人了。',403);
  if(now-member.last_seen>30000)await db.prepare('UPDATE members SET last_seen=? WHERE user_id=?').bind(now,user.userId).run();
  if(!member.room_ready)await db.prepare('INSERT OR IGNORE INTO room_state (id,data,revision,updated_at) VALUES (1,?,0,?)').bind(JSON.stringify(initialState(now)),now).run();
  return{userId:member.user_id,slot:member.slot,displayName:member.display_name};
}

export async function applyStoredOperation(db,op,member,now=Date.now()) {
  // Event deduplication and compare-and-swap keep two devices from overwriting each other.
  for(let attempt=0;attempt<8;attempt++){
    const prior=await db.prepare('SELECT id FROM home_events WHERE id=?').bind(op.id).first();
    if(prior)return;
    const row=await db.prepare('SELECT data,revision FROM room_state WHERE id=1').first();
    if(!row)throw new HomeError('小屋暂时不可用。',503);
    const next=applyOperation(JSON.parse(row.data),op,member,now),rev=row.revision+1;
    const result=await db.batch([
      db.prepare('UPDATE room_state SET data=?,revision=?,updated_at=? WHERE id=1 AND revision=? AND NOT EXISTS (SELECT 1 FROM home_events WHERE id=?)').bind(JSON.stringify(next),rev,now,row.revision,op.id),
      db.prepare('INSERT OR IGNORE INTO home_events (id,revision,created_at) SELECT ?,?,? WHERE changes()=1').bind(op.id,rev,now),
    ]);
    if(result[0].meta.changes===1)return;
  }
  throw new HomeError('另一台设备也在更新，请重试。',409);
}
