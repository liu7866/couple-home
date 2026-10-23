import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url),fromWrangler=createRequire(require.resolve('wrangler'));
const {Miniflare}=fromWrangler('miniflare');
const files=await readdir(resolve('dist/server'),{recursive:true});
const modules=['index.js',...files.filter(f=>f!=='index.js'&&/\.m?js$/.test(f))].map(path=>({type:'ESModule',path:resolve('dist/server',path)}));
const mf=new Miniflare({
  modules,modulesRoot:resolve('dist/server'),
  compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OWNER_LOGIN_EMAIL:'alice@example.test',PAGES_ORIGIN:'https://pages.example.test'},
});
const db=await mf.getD1Database('DB');
for(const file of (await readdir(resolve('drizzle'))).filter(x=>x.endsWith('.sql')).sort()){
 const sql=await readFile(resolve('drizzle',file),'utf8');
 for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
}
const origin='https://home.test';
const cookies=new Map();let partnerPassword='Warm-cottage#2026';
const identity=user=>user?{'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'}:{};
const auth=user=>({...identity(user),...(cookies.has(user)?{Cookie:cookies.get(user)}:{})});
const get=(path,user)=>mf.dispatchFetch(origin+path,{headers:auth(user)});
const post=(user,kind,payload)=>mf.dispatchFetch(origin+'/api/home',{method:'POST',headers:{...auth(user),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),kind,payload})});
test.after(()=>mf.dispose());

test('HTTP routes require identity and same-origin writes',async()=>{
 assert.equal((await get('/api/home')).status,401);
 const denied=await mf.dispatchFetch(origin+'/api/home',{method:'POST',headers:{...identity('alice'),Origin:'https://other.test','Content-Type':'application/json'},body:'{}'});
 assert.equal(denied.status,403);
 const a=await get('/api/home','alice');assert.equal(a.status,200);assert.equal((await a.json()).me.slot,1);
 const created=await mf.dispatchFetch(origin+'/api/passwords',{method:'POST',headers:{...identity('alice'),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:2,password:partnerPassword})});assert.equal(created.status,200);assert.deepEqual(await created.json(),{ok:true,slot:2});
 const login=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:2,password:partnerPassword})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));assert.ok(cookie.includes('SameSite=Strict'));cookies.set('bob',cookie.split(';')[0]);
 const b=await get('/api/home','bob');assert.equal(b.status,200);assert.equal((await b.json()).me.slot,2);
 assert.equal((await get('/api/home','charlie')).status,401);
});

test('two signed-in devices share changes, pet care and sealed letters',async()=>{
 const changed=await post('alice','settings',{names:['小月','小林'],start:'2026-01-01',intro:'今天也很喜欢你'});assert.equal(changed.status,200);
 const edits=await Promise.all([post('alice','pet.care',{action:'feed'}),post('bob','pet.care',{action:'feed'})]);
 for(const r of edits)assert.equal(r.status,200);
 let s=(await(await get('/api/home','bob')).json()).state;assert.deepEqual(s.names,['小月','小林']);assert.equal(s.pet.xp,20);assert.equal(s.pet.careLog.length,2);
 const letter=await post('alice','letter.add',{id:crypto.randomUUID(),author:'小月',text:'未来见',openDate:'2099-01-01'});assert.equal(letter.status,200);
 s=(await(await get('/api/home','bob')).json()).state;assert.equal(s.letters[0].locked,true);assert.equal(s.letters[0].text,'');
});

test('private photo uploads round-trip through R2 and repeat imports deduplicate',async()=>{
 const jpeg=new Uint8Array([255,216,255,224,12,34,255,217]);
 const upload=async bytes=>{const f=new FormData();f.append('photo',new Blob([bytes],{type:'image/jpeg'}),'memory.jpg');f.append('caption','一起看海');f.append('merge','1');const encoded=new Request(origin+'/api/photos',{method:'POST',body:f});return mf.dispatchFetch(origin+'/api/photos',{method:'POST',headers:{...identity('alice'),Origin:origin,...Object.fromEntries(encoded.headers)},body:await encoded.arrayBuffer()})};
 const r=await upload(jpeg);assert.equal(r.status,200);const p=await r.json();
 const duplicate=await upload(jpeg);assert.equal(duplicate.status,200);const q=await duplicate.json();assert.equal(q.id,p.id);assert.equal(q.existed,true);
 const sameCaption=await upload(new Uint8Array([255,216,255,224,90,80,255,217]));assert.equal(sameCaption.status,200);assert.notEqual((await sameCaption.json()).id,p.id);
 const photo=await get('/api/photos/'+p.id,'bob');assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),jpeg);
 assert.equal((await get('/api/photos/'+p.id)).status,401);
 const list=(await(await get('/api/home','bob')).json()).state.photos;assert.equal(list.length,2);
 const removed=await mf.dispatchFetch(origin+'/api/photos/'+p.id,{method:'DELETE',headers:{...auth('bob'),Origin:origin}});assert.equal(removed.status,200);
 assert.equal((await get('/api/photos/'+p.id,'alice')).status,404);
});


test('password management is owner-only and changing a password revokes prior sessions',async()=>{
 assert.equal((await get('/api/passwords')).status,403);
 assert.equal((await get('/api/passwords','bob')).status,403);
 const data=(await(await get('/api/passwords','alice')).json()).passwords;assert.equal(data[0].slot,2);assert.ok(!('password_hash'in data[0]));
 const newPassword='New-cottage#2026';
 const replacement=await mf.dispatchFetch(origin+'/api/passwords',{method:'POST',headers:{...identity('alice'),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:2,password:newPassword})});assert.equal(replacement.status,200);
 assert.equal((await get('/api/home','bob')).status,401);
 const oldLogin=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:2,password:partnerPassword})});assert.equal(oldLogin.status,401);
 const login=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:2,password:newPassword})});assert.equal(login.status,200);cookies.set('bob',login.headers.get('set-cookie').split(';')[0]);
 const restored=await get('/api/home','bob');assert.equal(restored.status,200);const s=await restored.json();assert.equal(s.state.pet.xp,20);assert.equal(s.me.slot,2);assert.equal(s.me.canManagePasswords,false);
 const rows=await db.prepare('SELECT password_hash,salt FROM member_passwords').all();assert.ok(rows.results.every(r=>r.password_hash!==newPassword&&r.password_hash!==partnerPassword&&r.password_hash.length===64&&r.salt.length===64));
 const logout=await mf.dispatchFetch(origin+'/api/auth',{method:'DELETE',headers:{...auth('bob'),Origin:origin}});assert.equal(logout.status,200);assert.equal((await get('/api/home','bob')).status,401);
});

test('weak passwords and legacy keys are rejected; both slots can use passwords',async()=>{
 const set=async(slot,password)=>mf.dispatchFetch(origin+'/api/passwords',{method:'POST',headers:{...identity('alice'),Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot,password})});
 assert.equal((await set(1,'short')).status,400);
 const password='Moonlight-garden#2026';assert.equal((await set(1,password)).status,200);
 const login=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({slot:1,password})});assert.equal(login.status,200);
 const home=await mf.dispatchFetch(origin+'/api/home',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}});assert.equal(home.status,200);assert.equal((await home.json()).me.slot,1);
 const legacy=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key:'home-'+'a'.repeat(64)})});assert.equal(legacy.status,401);
});

test('anonymous visitors receive a password page and cannot fetch shared data',async()=>{
 const root=await get('/');assert.equal(root.status,200);const html=await root.text();assert.ok(html.includes('小屋密码'));assert.ok(!html.includes('小月'));assert.ok(!html.includes('小林'));assert.ok(!html.includes('未来见'));
 const blocked=await get('/api/home');assert.equal(blocked.status,401);
 for(let i=0;i<11;i++){const r=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','cf-connecting-ip':'203.0.113.88'},body:JSON.stringify({slot:2,password:'not-the-right-password'})});assert.equal(r.status,i===10?429:401)}
});


test('GitHub Pages login, photos and writes use a restricted bearer session',async()=>{
 const pages='https://pages.example.test';
 const preflight=await mf.dispatchFetch(origin+'/api/home',{method:'OPTIONS',headers:{Origin:pages,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),pages);assert.ok(preflight.headers.get('access-control-allow-headers').includes('Authorization'));
 const denied=await mf.dispatchFetch(origin+'/api/home',{method:'OPTIONS',headers:{Origin:'https://other.example','Access-Control-Request-Method':'POST'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
 const login=await mf.dispatchFetch(origin+'/api/auth',{method:'POST',headers:{Origin:pages,'Content-Type':'application/json','cf-connecting-ip':'203.0.113.99'},body:JSON.stringify({slot:2,password:'New-cottage#2026'})});assert.equal(login.status,200);assert.equal(login.headers.get('access-control-allow-origin'),pages);assert.equal(login.headers.get('set-cookie'),null);const token=(await login.json()).token;assert.match(token,/^[a-f0-9]{64}$/);
 const headers={Origin:pages,Authorization:'Bearer '+token};
 const home=await mf.dispatchFetch(origin+'/api/home',{headers});assert.equal(home.status,200);const data=await home.json();assert.equal(data.me.slot,2);assert.equal(data.state.pet.xp,20);
 const photo=await mf.dispatchFetch(origin+data.state.photos[0].url,{headers});assert.equal(photo.status,200);assert.equal(photo.headers.get('access-control-allow-origin'),pages);assert.equal(photo.headers.get('content-type'),'image/jpeg');
 const write=await mf.dispatchFetch(origin+'/api/home',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),kind:'wish.add',payload:{id:crypto.randomUUID(),text:'在 GitHub 小屋一起看星星'}})});assert.equal(write.status,200);assert.ok((await write.json()).state.wishes.some(w=>w.text.includes('GitHub')));
 const outsider=await mf.dispatchFetch(origin+'/api/home',{headers:{Origin:'https://other.example',Authorization:'Bearer '+token}});assert.equal(outsider.status,401);assert.equal(outsider.headers.get('access-control-allow-origin'),null);
 const withoutOrigin=await mf.dispatchFetch(origin+'/api/home',{headers:{Authorization:'Bearer '+token}});assert.equal(withoutOrigin.status,401);
 const logout=await mf.dispatchFetch(origin+'/api/auth',{method:'DELETE',headers});assert.equal(logout.status,200);assert.equal((await mf.dispatchFetch(origin+'/api/home',{headers})).status,401);
});
