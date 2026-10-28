import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=await readFile('public/app.js','utf8');
const code=source.slice(source.indexOf('async function downloadFullBackup()'),source.indexOf('async function exportData()'));
function fixture(fail=false){
 const button={},progress={after:()=>{}},close={dataset:{},addEventListener:()=>{}};let saved=null,downloads=0;
 const BackupBlob=fail==='oversize'?class extends Blob{get size(){return 1024*1024*1024+1}}:Blob;
 const state={v:2,pet:{xp:30},letters:[{text:'未来见',openDate:'2099-01-01'}],photos:[{id:'one',caption:'海边'},{id:'two',caption:'落日'}]};
 const context=vm.createContext({navigator:{},Blob:BackupBlob,Uint8Array,Array,JSON,Date,structuredClone,AbortSignal,crypto:webcrypto,queue:Promise.resolve(),$:s=>s==='#download-full-backup'?button:s==='#backup-progress'?progress:close,api:async()=>({state,exportedAt:'2026-10-23T00:00:00Z',revision:7}),backendFetch:async path=>fail===true&&path.endsWith('two')?new Response('',{status:404}):new Response(new Uint8Array(fail==='corrupt'&&path.endsWith('two')?[1,2,3]:[255,216,255]),{headers:{'content-type':fail==='png'&&path.endsWith('two')?'image/png':fail==='parameters'?'image/jpeg; charset=binary':fail==='uppercase'?'IMAGE/JPEG':'image/jpeg'}}),blobData:async blob=>'data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64'),URL:{createObjectURL:blob=>{saved=blob;return 'blob:test'},revokeObjectURL:()=>{}},document:{body:{append:()=>{}},createElement:()=>({click:()=>downloads++,remove:()=>{},after:()=>{}})},today:()=> '2026-10-23',setTimeout:()=>{},toast:()=>{}});
 vm.runInContext(code,context);return{run:()=>context.downloadFullBackup(),get saved(){return saved},get downloads(){return downloads},button,progress};
}
test('full download embeds every photo, future letter and pet with checksums',async()=>{const f=fixture();await f.run();assert.equal(f.downloads,1);const data=JSON.parse(await f.saved.text());assert.equal(data.photos.length,2);assert.ok(data.photos.every(p=>p.data.startsWith('data:image/jpeg;base64,')));assert.equal(data.letters[0].text,'未来见');assert.equal(data.pet.xp,30);assert.equal(Object.keys(data.backup.photoChecksums).length,2);assert.match(data.backup.photoChecksums.one,/^[a-f0-9]{64}$/);assert.equal(f.button.disabled,false)});
test('one missing photo fails the whole download instead of creating an incomplete archive',async()=>{const f=fixture(true);await f.run();assert.equal(f.downloads,0);assert.equal(f.saved,null);assert.match(f.progress.textContent,/未能完整下载/);assert.equal(f.button.disabled,false)});
for(const kind of ['corrupt','png'])test('full backup refuses '+kind+' image data',async()=>{const f=fixture(kind);await f.run();assert.equal(f.downloads,0);assert.equal(f.saved,null);assert.match(f.progress.textContent,/照片/)});
test('large generated backups remain downloadable but clearly warn about the 1GB web import limit',async()=>{const f=fixture('oversize');await f.run();assert.equal(f.downloads,1);assert.ok(f.saved);assert.match(f.progress.textContent,/超过 1GB/);assert.match(f.progress.textContent,/服务器快照/)});
for(const kind of ['parameters','uppercase'])test('valid JPEG responses with '+kind+' media type are exported in an importable format',async()=>{const f=fixture(kind);await f.run();assert.ok(f.saved);const backup=JSON.parse(await f.saved.text());assert.ok(backup.photos.every(p=>p.data.startsWith('data:image/jpeg;base64,')))});
