import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('public/app.js','utf8');
const code=source.slice(source.indexOf('let photoLoadRunning='),source.indexOf('// Keep stable photo'));
function fixture(count=8){
 const images=Array.from({length:count},(_,i)=>({dataset:{photoId:'photo-'+i},visible:false,getClientRects(){return this.visible?[{}]:[]}}));
 const requests=[],pending=[],revoked=[];let active=0,maxActive=0;
 const context=vm.createContext({PAGES_MODE:true,pagesToken:'test-session',ready:true,state:{photos:images.map(i=>({id:i.dataset.photoId}))},photoCache:new Map(),document:{body:{dataset:{roomPage:'home'}},querySelectorAll:()=>images},AbortSignal,queueMicrotask,URL:{createObjectURL:()=> 'blob:test-'+revoked.length+'-'+Math.random(),revokeObjectURL:url=>revoked.push(url)},backendFetch:path=>{requests.push(path);active++;maxActive=Math.max(maxActive,active);return new Promise(resolve=>pending.push(()=>{active--;resolve(new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}}))}))}});
 vm.runInContext(code,context);
 return{context,images,requests,pending,revoked,get maxActive(){return maxActive},run:()=>context.loadPagesPhotos()};
}
test('hidden gallery makes no image requests and visible gallery loads with bounded parallelism',async()=>{
 const f=fixture();await f.run();assert.equal(f.requests.length,0);
 f.images.forEach(i=>i.visible=true);const loading=f.run();assert.equal(f.requests.length,3);
 await f.run();assert.equal(f.requests.length,3);
 while(f.requests.length<f.images.length||f.pending.length){const batch=f.pending.splice(0);batch.forEach(resolve=>resolve());await new Promise(setImmediate)}
 await loading;assert.equal(f.maxActive,3);assert.equal(f.requests.length,f.images.length);assert.ok(f.images.every(i=>i.src.startsWith('blob:')));
 await f.run();assert.equal(f.requests.length,f.images.length);
});
test('a completed photo response cannot reattach a URL after sign-in invalidates its cache',async()=>{
 const f=fixture(1);f.images[0].visible=true;const loading=f.run();f.context.photoCache.clear();f.context.ready=false;f.pending.shift()();await loading;
 assert.equal(f.images[0].src,undefined);assert.equal(f.revoked.length,1);assert.equal(f.context.photoCache.size,0);
});
