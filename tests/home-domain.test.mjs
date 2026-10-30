import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyOperation, publicState, petNow, sharedToday, HomeError, restoreState } from '../lib/home-domain.mjs';
const now=Date.parse('2026-10-23T16:30:00Z');
const alice={userId:'alice',slot:1,displayName:'Alice'},bob={userId:'bob',slot:2,displayName:'Bob'};
const op=(kind,payload,id=crypto.randomUUID())=>({id,kind,payload});

test('both members can customize stages and full backups restore them without changing growth',()=>{
 const stages=[{name:'蛋糕',start:0,kind:'bunny',shape:'baby',color:'#AABBCC',accessory:'bow'},{name:'星星',start:120,kind:'cat',shape:'grown',color:'#102030',accessory:'star'}];
 let s=initialState(now);s.pet.xp=125;const payload={name:'小团',petKind:'cat',color:'cream',stages};
 s=applyOperation(s,op('pet.settings',payload),alice,now);assert.equal(s.pet.xp,125);assert.equal(s.pet.stages[0].color,'#aabbcc');
 const changed=structuredClone(stages);changed[1].name='月亮';s=applyOperation(s,op('pet.settings',{...payload,stages:changed}),bob,now);
 assert.equal(publicState(s,now,1).pet.stages[1].name,'月亮');assert.deepEqual(restoreState(s,alice,now+1).pet.stages,s.pet.stages);
 const legacy=initialState(now);assert.equal(restoreState(legacy,alice,now+1).pet.stages,undefined);
 for(const invalid of [[stages[0]], [{...stages[0],start:1},stages[1]],[stages[0],{...stages[1],start:0}],[stages[0],{...stages[1],color:'red;evil'}]])assert.throws(()=>applyOperation(s,op('pet.settings',{...payload,stages:invalid}),bob,now),HomeError);
});

test('two members keep separate moods and both contributions',()=>{
 let s=initialState(now);
 s=applyOperation(s,op('mood',{mood:'想你'}),alice,now);
 s=applyOperation(s,op('mood',{mood:'晴朗'}),bob,now);
 s=applyOperation(s,op('wish.add',{id:crypto.randomUUID(),text:'看海'}),alice,now);
 s=applyOperation(s,op('story.add',{id:crypto.randomUUID(),title:'散步',text:'今天一起散步',date:'2026-10-23'}),bob,now);
 assert.deepEqual(s.moods['2026-10-24'],{1:'想你',2:'晴朗'});
 assert.equal(s.wishes.length,1);assert.equal(s.stories.length,1);
});

test('timed letters never return text before the agreed shared date',()=>{
 let s=applyOperation(initialState(now),op('letter.add',{id:crypto.randomUUID(),author:'A',text:'a secret for tomorrow',openDate:'2026-10-25'}),alice,now);
 const sealed=publicState(s,now);assert.equal(sealed.letters[0].text,'');assert.equal(sealed.letters[0].locked,true);
 assert.equal(s.letters[0].text,'a secret for tomorrow');
 assert.equal(publicState(s,Date.parse('2026-10-24T16:00:00Z')).letters[0].text,'a secret for tomorrow');
});

test('pet cooldown belongs to the signed-in member and is enforced on server',()=>{
 let s=applyOperation(initialState(now),op('pet.care',{action:'feed'}),alice,now);
 assert.throws(()=>applyOperation(s,op('pet.care',{action:'feed',userId:'bob'}),alice,now+1000),e=>e.status===429);
 s=applyOperation(s,op('pet.care',{action:'feed'}),bob,now+1000);
 assert.equal(s.pet.xp,20);assert.deepEqual(s.pet.careLog.map(x=>x.slot),[2,1]);
 assert.equal(s.pet.fullness,100);assert.ok(!('cooldowns'in publicState(s).pet));
});

test('a long absence never kills the pet or drops stats below their gentle floor',()=>{
 const p=petNow(initialState(now).pet,now+365*86400000);
 assert.equal(p.fullness,20);assert.equal(p.happiness,20);assert.equal(p.energy,20);
});

test('sleep and care converge using elapsed server time',()=>{
 let s=initialState(now);s.pet.energy=40;s=applyOperation(s,op('pet.care',{action:'sleep'}),alice,now);
 assert.throws(()=>applyOperation(s,op('pet.care',{action:'play'}),bob,now+1000),e=>e.status===409);
 const rested=petNow(s.pet,now+6*60e3);assert.ok(rested.energy>48);assert.ok(rested.energy<=100);
});

test('imports merge and deduplicate without deleting cloud records or the pet',()=>{
 let s=initialState(now);s=applyOperation(s,op('wish.add',{id:crypto.randomUUID(),text:'看海'}),bob,now);s.pet.xp=250;
 const data={v:1,names:['月','林'],start:'2026-01-01',intro:'你好',stories:[],wishes:[{text:'看海',done:true},{text:'看日出',done:false}],letters:[],anniversaries:[],photos:[]};
 s=applyOperation(s,op('import',{data}),alice,now);
 s=applyOperation(s,op('import',{data}),alice,now);
 assert.equal(s.wishes.length,2);assert.equal(s.pet.xp,250);assert.equal(s.names[0],'月');
});

test('invalid dates, unauthorized actors and oversized inputs are rejected',()=>{
 const s=initialState(now);
 assert.throws(()=>applyOperation(s,op('settings',{names:['a','b'],start:'2026-02-30'}),alice,now),HomeError);
 assert.throws(()=>applyOperation(s,op('settings',{names:['a','b'],start:'9999-99-99'}),alice,now),HomeError);
 assert.throws(()=>applyOperation(s,op('mood',{mood:'晴朗'}),{...bob,slot:3},now),e=>e.status===401);
 assert.throws(()=>applyOperation(s,op('wish.add',{id:crypto.randomUUID(),text:'x'.repeat(101)}),bob,now),HomeError);
 assert.equal(sharedToday(now),'2026-10-24');
});

test('duet needs two distinct members and expired invitations do not grant growth',()=>{
 let s=applyOperation(initialState(now),op('pet.duet',{}),alice,now);assert.equal(s.pet.xp,0);assert.equal(s.pet.duet.slot,1);
 assert.throws(()=>applyOperation(s,op('pet.duet',{}),alice,now+21000),HomeError);
 s=applyOperation(s,op('pet.duet',{}),bob,now+1000);assert.equal(s.pet.xp,20);assert.equal(s.pet.duet,null);assert.equal(s.pet.careLog[0].action,'duet');
 let expired=applyOperation(initialState(now),op('pet.duet',{}),alice,now);expired=applyOperation(expired,op('pet.duet',{}),bob,now+300001);assert.equal(expired.pet.xp,0);assert.equal(expired.pet.duet.slot,2);
});

test('merging a backup restores missing mood slots but preserves newer shared moods',()=>{
 const current=initialState(now);current.moods={'2026-10-20':{1:'晴朗'}};const backup=initialState(now);backup.moods={'2026-10-20':{1:'想你',2:'需要抱抱'},'2026-10-21':{1:'平静'}};
 const merged=applyOperation(current,op('import',{data:backup}),alice,now);assert.equal(merged.moods['2026-10-20'][1],'晴朗');assert.equal(merged.moods['2026-10-20'][2],'需要抱抱');assert.equal(merged.moods['2026-10-21'][1],'平静');assert.deepEqual(merged.pet,current.pet);
});
