import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyOperation, publicState, petNow, sharedToday, HomeError } from '../lib/home-domain.mjs';
const now=Date.parse('2026-10-23T16:30:00Z');
const alice={userId:'alice',slot:1,displayName:'Alice'},bob={userId:'bob',slot:2,displayName:'Bob'};
const op=(kind,payload,id=crypto.randomUUID())=>({id,kind,payload});

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
