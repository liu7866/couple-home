import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { ensureMember, applyStoredOperation } from '../lib/home-repository.mjs';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler'));
const {Miniflare}=wranglerRequire('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['DB'],compatibilityDate:'2026-05-15'});
const db=await mf.getD1Database('DB');
const sql=await readFile(new URL('../drizzle/0000_wakeful_lockheed.sql',import.meta.url),'utf8');
for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
const now=Date.now();
test.after(()=>mf.dispose());

test('concurrent first visits allocate exactly two members and reuse their identity',async()=>{
 const [a,b]=await Promise.all([ensureMember(db,{userId:'alice',displayName:'A'},now),ensureMember(db,{userId:'bob',displayName:'B'},now)]);
 assert.deepEqual(new Set([a.slot,b.slot]),new Set([1,2]));
 assert.equal((await ensureMember(db,{userId:'alice',displayName:'A'},now)).slot,a.slot);
 await assert.rejects(()=>ensureMember(db,{userId:'charlie',displayName:'C'},now),e=>e.status===403);
});

test('simultaneous device edits preserve both records and duplicate retries apply once',async()=>{
 const alice=await ensureMember(db,{userId:'alice',displayName:'A'},now),bob=await ensureMember(db,{userId:'bob',displayName:'B'},now);
 const a={id:crypto.randomUUID(),kind:'wish.add',payload:{id:crypto.randomUUID(),text:'一起看海'}};
 const b={id:crypto.randomUUID(),kind:'story.add',payload:{id:crypto.randomUUID(),title:'一起散步',text:'晚风很温柔',date:'2026-10-23'}};
 await Promise.all([applyStoredOperation(db,a,alice,now),applyStoredOperation(db,b,bob,now),applyStoredOperation(db,a,alice,now)]);
 const row=await db.prepare('SELECT data,revision FROM room_state WHERE id=1').first(),s=JSON.parse(row.data);
 assert.equal(s.wishes.length,1);assert.equal(s.stories.length,1);assert.equal(row.revision,2);
 const events=await db.prepare('SELECT COUNT(*) AS n FROM home_events').first();assert.equal(events.n,2);
});

test('same pet action retried by a disconnected device cannot award XP twice',async()=>{
 const alice=await ensureMember(db,{userId:'alice',displayName:'A'},now);
 const action={id:crypto.randomUUID(),kind:'pet.care',payload:{action:'feed'}};
 await Promise.all([applyStoredOperation(db,action,alice,now),applyStoredOperation(db,action,alice,now)]);
 await applyStoredOperation(db,action,alice,now+60000);
 const row=await db.prepare('SELECT data FROM room_state WHERE id=1').first(),pet=JSON.parse(row.data).pet;
 assert.equal(pet.xp,10);assert.equal(pet.careLog.length,1);
});

 test('returning members refresh without redundant room initialization writes',async()=>{const statements=[];const observed={prepare(sql){statements.push(sql);return db.prepare(sql)}};const member=await ensureMember(observed,{userId:'alice',displayName:'A'},now+1000);assert.ok([1,2].includes(member.slot));assert.equal(statements.some(sql=>/^(INSERT|UPDATE|DELETE)/.test(sql)),false);});
