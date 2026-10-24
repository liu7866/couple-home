import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {homeSyncTag} from '../lib/home-sync-tag.mjs';
const ctx=vm.createContext({});vm.runInContext(await readFile('public/room-helpers.js','utf8'),ctx);
const {createDraftStore,photoNearViewport,requestFailureMessage}=ctx.LittleDaysHelpers;
const memory=()=>{const map=new Map();return{getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map}};
test('drafts exclude credentials, stay separate by member and kind, and expire',()=>{
 const storage=memory(),a=createDraftStore(storage,'room:1'),b=createDraftStore(storage,'room:2'),now=1000000000;
 assert.equal(a.write('story',{title:'晚风',text:'一起回家',password:'secret',token:'secret'},now),true);
 assert.equal(a.read('story',now).text,'一起回家');assert.equal(a.read('story',now).password,undefined);assert.equal(b.read('story',now),null);assert.equal(a.read('letter',now),null);
 assert.equal(a.write('password',{password:'secret'},now),false);assert.ok(![...storage.map.values()].some(x=>x.includes('secret')));
 assert.equal(a.read('story',now+7*86400000),null);assert.equal(storage.map.size,0);
});
test('draft corruption, future dates and unavailable storage fail safely',()=>{
 const storage=memory(),store=createDraftStore(storage,'room:1');store.write('letter',{text:'下次见'},1000);assert.equal(store.read('letter',999),null);
 storage.setItem('little-days-draft:room:1:story','invalid');assert.equal(store.read('story'),null);
 const blocked=createDraftStore({getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}},'x');assert.equal(blocked.read('story'),null);assert.equal(blocked.write('story',{text:'草稿'}),false);
});
test('photo loading excludes hidden and far-away images but includes approaching images',()=>{
 const image=(top,bottom,visible=true)=>({getClientRects:()=>visible?[{}]:[],getBoundingClientRect:()=>({top,bottom})});
 assert.equal(photoNearViewport(image(2000,2300),800),false);assert.equal(photoNearViewport(image(950,1200),800),true);assert.equal(photoNearViewport(image(-700,-300),800),false);assert.equal(photoNearViewport(image(0,300,false),800),false);
});
test('network failures and timeouts have useful messages without blaming the password',()=>{
 assert.match(requestFailureMessage({name:'TimeoutError'}),/超时/);assert.match(requestFailureMessage(new TypeError('Failed to fetch')),/暂时无法验证密码/);
});
test('sync tags invalidate for photo metadata, viewer, revision and scheduled time boundaries',async()=>{
 const photos=[{id:'a',caption:'晚霞',created_at:100}],now=1792842000000;
 const tag=await homeSyncTag(1,photos,[1,false,'password'],now);
 assert.equal(tag,await homeSyncTag(1,photos,[1,false,'password'],now+1));
 for(const changed of [homeSyncTag(2,photos,[1,false,'password'],now),homeSyncTag(1,[{...photos[0],caption:'早晨'}],[1,false,'password'],now),homeSyncTag(1,photos,[2,false,'password'],now),homeSyncTag(1,photos,[1,false,'password'],now+60000)])assert.notEqual(tag,await changed);
});
