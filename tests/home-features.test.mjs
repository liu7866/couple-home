import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyOperation,publicState,restoreState} from '../lib/home-domain.mjs';
import {questionForDay} from '../lib/home-features.mjs';
const now=Date.now(),a={userId:'alice',slot:1,displayName:'A'},b={userId:'bob',slot:2,displayName:'B'},op=(kind,payload={})=>({id:crypto.randomUUID(),kind,payload});
test('daily answers remain sealed on all members devices until both respond',()=>{
 let state=applyOperation(initialState(now),op('daily.answer',{answer:'想一起看海'}),a,now),day=Object.keys(state.daily)[0];assert.equal(state.daily[day].question,questionForDay(day));assert.equal(publicState(state,now,2).daily[day].answers[1],undefined);assert.equal(publicState(state,now,1).daily[day].answers[1].text,'想一起看海');assert.equal(publicState(state,now,1).daily[day].revealed,false);
 state=applyOperation(state,op('daily.answer',{answer:'想一起散步'}),b,now+1);assert.equal(publicState(state,now+1,1).daily[day].revealed,true);assert.equal(publicState(state,now+1,2).daily[day].answers[1].text,'想一起看海');assert.equal(state.daily[day].answers[1].text,'想一起看海');
});
test('coupons can only be claimed by recipient and redeemed by issuer in order',()=>{
 const id=crypto.randomUUID();let state=applyOperation(initialState(now),op('coupon.add',{id,title:'抱抱券',note:'慢慢兑现'}),a,now);assert.throws(()=>applyOperation(state,op('coupon.claim',{id}),a,now));assert.throws(()=>applyOperation(state,op('coupon.redeem',{id}),a,now));state=applyOperation(state,op('coupon.claim',{id}),b,now);assert.throws(()=>applyOperation(state,op('coupon.redeem',{id}),b,now));state=applyOperation(state,op('coupon.redeem',{id}),a,now);assert.equal(state.coupons[0].status,'redeemed');assert.throws(()=>applyOperation(state,op('coupon.claim',{id}),b,now));
});
test('idea draw only chooses unfinished ideas and completed ideas validate story and photo links',()=>{
 let state=initialState(now);assert.throws(()=>applyOperation(state,op('idea.draw'),a,now));const id=crypto.randomUUID(),story=crypto.randomUUID(),photo=crypto.randomUUID();state=applyOperation(state,op('idea.add',{id,text:'去看海'}),a,now);state=applyOperation(state,op('story.add',{id:story,title:'海边',date:'2026-01-01',text:'海风很好'}),a,now);state=applyOperation(state,op('idea.draw'),b,now);assert.equal(state.dateDraw.id,id);assert.throws(()=>applyOperation(state,op('idea.done',{id,photoId:photo}),a,now));state=applyOperation(state,op('idea.done',{id,storyId:story,photoId:photo}),{...a,photoIds:[photo]},now);assert.equal(state.dateIdeas[0].storyId,story);assert.throws(()=>applyOperation(state,op('idea.draw'),a,now));
});
test('decorations require earned growth and private corners always write the signed-in slot',()=>{
 let state=initialState(now);assert.throws(()=>applyOperation(state,op('room.decorate',{theme:'rose',items:['stars']}),a,now));state.pet.xp=500;state=applyOperation(state,op('room.decorate',{theme:'sage',items:['stars','plant']}),a,now);assert.equal(state.pet.xp,500);state=applyOperation(state,op('corner.save',{slot:2,nickname:'小太阳',food:'面条'}),a,now);assert.equal(state.corners[1].nickname,'小太阳');assert.equal(state.corners[2],undefined);
});
test('backup restores all extensions and merges without overwriting newer choices',()=>{
 let backup=initialState(now);backup.pet.xp=500;backup=applyOperation(backup,op('room.decorate',{theme:'rose',items:['stars']}),a,now);backup=applyOperation(backup,op('calendar.add',{id:crypto.randomUUID(),title:'见面',date:'2026-12-01',type:'meet'}),a,now);backup=applyOperation(backup,op('daily.answer',{answer:'旧答案'}),a,now);backup=applyOperation(backup,op('corner.save',{nickname:'小月'}),a,now);const restored=restoreState(backup,a,now+1);assert.equal(restored.calendar.length,1);assert.deepEqual(restored.pet.room,backup.pet.room);assert.equal(restored.corners[1].nickname,'小月');let current=applyOperation(initialState(now),op('daily.answer',{answer:'新答案'}),a,now);current=applyOperation(current,op('import',{data:backup}),a,now);assert.equal(current.calendar.length,1);assert.equal(current.pet.xp,0);assert.equal(Object.values(current.daily)[0].answers[1].text,'新答案');assert.equal(current.pet.room.theme,'cream');
});
test('invalid calendar dates and oversized feature payloads are rejected',()=>{assert.throws(()=>applyOperation(initialState(now),op('calendar.add',{id:crypto.randomUUID(),title:'日子',date:'2026-02-30',type:'meet'}),a,now));assert.throws(()=>applyOperation(initialState(now),op('daily.answer',{answer:'x'.repeat(1001)}),a,now))});

test('missed questions can be answered later without inventing past or future questions',()=>{
 const earlier=now-86400000;let state=applyOperation(initialState(earlier),op('daily.answer',{answer:'昨天的心意'}),a,earlier);const day=Object.keys(state.daily)[0];state=applyOperation(state,op('daily.answer',{day,answer:'迟到但认真的回应'}),b,now);assert.equal(publicState(state,now,1).daily[day].revealed,true);assert.throws(()=>applyOperation(state,op('daily.answer',{day:'2000-01-01',answer:'伪造问题'}),b,now));assert.throws(()=>applyOperation(state,op('daily.answer',{day:'2099-01-01',answer:'未来问题'}),b,now));
});
test('ordinary backup imports cannot write another members answers, profile or coupon status',()=>{
 let backup=applyOperation(initialState(now),op('daily.answer',{answer:'属于另一位'}),b,now);backup=applyOperation(backup,op('corner.save',{nickname:'另一位的档案'}),b,now);backup=applyOperation(backup,op('coupon.add',{id:crypto.randomUUID(),title:'另一位送的券'}),b,now);
 const merged=applyOperation(initialState(now),op('import',{data:backup}),a,now);assert.equal(Object.keys(merged.daily).length,0);assert.equal(merged.corners[2],undefined);assert.equal(merged.coupons.length,0);
 const owner=applyOperation(initialState(now),op('import',{data:backup}),{...a,canManageSharedImport:true},now);assert.equal(Object.values(owner.daily)[0].answers[2].text,'属于另一位');assert.equal(owner.corners[2].nickname,'另一位的档案');assert.equal(owner.coupons.length,1);
});
test('restored and merged idea story links reference the new real story IDs',()=>{
 let backup=initialState(now);const story=crypto.randomUUID(),idea=crypto.randomUUID();backup=applyOperation(backup,op('story.add',{id:story,title:'看海',date:'2026-01-01',text:'一起听海浪'}),a,now);backup=applyOperation(backup,op('idea.add',{id:idea,text:'去看海'}),a,now);backup=applyOperation(backup,op('idea.done',{id:idea,storyId:story}),a,now);
 const restored=restoreState(backup,a,now+1);assert.equal(restored.dateIdeas[0].storyId,restored.stories[0].id);const merged=applyOperation(initialState(now),op('import',{data:backup}),a,now);assert.equal(merged.dateIdeas[0].storyId,merged.stories[0].id);
 const completedAt=backup.dateIdeas[0].completedAt;const edited=applyOperation(backup,op('idea.done',{id:idea,storyId:story}),a,now+86400000);assert.equal(edited.dateIdeas[0].completedAt,completedAt);
});
test('only the author can remove an unfinished idea and the draw clears with it',()=>{
 const idea=crypto.randomUUID();let state=applyOperation(initialState(now),op('idea.add',{id:idea,text:'一起散步'}),a,now);state=applyOperation(state,op('idea.draw'),a,now);assert.throws(()=>applyOperation(state,op('idea.remove',{id:idea}),b,now));state=applyOperation(state,op('idea.remove',{id:idea}),a,now);assert.equal(state.dateIdeas.length,0);assert.equal(state.dateDraw,undefined);
});
