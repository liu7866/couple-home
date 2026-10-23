import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await readFile('public/app.js','utf8');
const code=source.slice(source.indexOf('async function downloadFullBackup()'),source.indexOf('async function exportData()'));
function fixture(fail=false){
 const button={},progress={after:()=>{}},close={dataset:{},addEventListener:()=>{}};let saved=null,downloads=0;
 const state={v:2,pet:{xp:30},letters:[{text:'未来见',openDate:'2099-01-01'}],photos:[{id:'one',caption:'海边'},{id:'two',caption:'落日'}]};
 const context=vm.createContext({navigator:{},Blob,Uint8Array,Array,JSON,Date,structuredClone,AbortSignal,crypto:webcrypto,queue:Promise.resolve(),$:s=>s==='#download-full-backup'?button:s==='#backup-progress'?progress:close,api:async()=>({state,exportedAt:'2026-10-23T00:00:00Z',revision:7}),backendFetch:async path=>fail&&path.endsWith('two')?new Response('',{status:404}):new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}}),blobData:async blob=>'data:image/jpeg;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64'),URL:{createObjectURL:blob=>{saved=blob;return 'blob:test'},revokeObjectURL:()=>{}},document:{body:{append:()=>{}},createElement:()=>({click:()=>downloads++,remove:()=>{},after:()=>{}})},today:()=> '2026-10-23',setTimeout:()=>{},toast:()=>{}});
 vm.runInContext(code,context);return{run:()=>context.downloadFullBackup(),get saved(){return saved},get downloads(){return downloads},button,progress};
}
test('full download embeds every photo, future letter and pet with checksums',async()=>{const f=fixture();await f.run();assert.equal(f.downloads,1);const data=JSON.parse(await f.saved.text());assert.equal(data.photos.length,2);assert.ok(data.photos.every(p=>p.data.startsWith('data:image/jpeg;base64,')));assert.equal(data.letters[0].text,'未来见');assert.equal(data.pet.xp,30);assert.equal(Object.keys(data.backup.photoChecksums).length,2);assert.match(data.backup.photoChecksums.one,/^[a-f0-9]{64}$/);assert.equal(f.button.disabled,false)});
test('one missing photo fails the whole download instead of creating an incomplete archive',async()=>{const f=fixture(true);await f.run();assert.equal(f.downloads,0);assert.equal(f.saved,null);assert.match(f.progress.textContent,/未能完整下载/);assert.equal(f.button.disabled,false)});
