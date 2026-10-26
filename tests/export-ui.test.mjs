import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile('public/app.js','utf8');const code=source.slice(source.indexOf('async function exportData()'),source.indexOf('let legacy='));
function fixture(kind='ok'){
 const button={},note={append:()=>{}},callbacks=[];const dialog={dataset:{},addEventListener:(name,fn)=>callbacks.push(fn)};let file=null,downloads=0,revoked=0;
 const state={photos:[{id:'one',caption:'回忆'}],letters:[{text:'已揭晓'}, {text:'未来见',locked:true}],pet:{name:'团团'}};
 const c=vm.createContext({needReady:()=>true,queue:Promise.resolve(),state,structuredClone,Blob,AbortSignal,JSON,URL:{createObjectURL:blob=>{file=blob;return 'blob:test'},revokeObjectURL:()=>revoked++},blobData:async b=>'data:image/jpeg;base64,'+Buffer.from(await b.arrayBuffer()).toString('base64'),today:()=> '2026-10-24',$:s=>s==='#export'?button:s==='#modal'?dialog:note,document:{createElement:()=>({click:()=>downloads++})},backendFetch:async()=>kind==='html'?new Response('<html>blocked</html>',{headers:{'content-type':'text/html'}}):new Response(kind==='empty'?new Uint8Array():new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}})});vm.runInContext(code,c);
 return{run:()=>c.exportData(),button,dialog,note,get file(){return file},get downloads(){return downloads},get revoked(){return revoked},close:()=>callbacks.forEach(fn=>fn())};
}
test('ordinary export excludes sealed letters and keeps the fallback download alive until close',async()=>{
 const f=fixture();await f.run();const data=JSON.parse(await f.file.text());assert.equal(data.photos.length,1);assert.equal(data.letters.length,1);assert.equal(data.letters[0].text,'已揭晓');assert.equal(f.downloads,1);assert.equal(f.revoked,0);f.close();assert.equal(f.revoked,1);assert.equal(f.button.disabled,false);assert.equal(f.dialog.dataset.busy,'0');
});
for(const kind of ['html','empty'])test('ordinary export rejects '+kind+' image responses instead of producing a broken backup',async()=>{
 const f=fixture(kind);await f.run();assert.equal(f.file,null);assert.equal(f.downloads,0);assert.match(f.note.textContent,/没有生成/);assert.equal(f.button.disabled,false);assert.equal(f.dialog.dataset.busy,'0');
});
test('backup and import transitions preserve a settings form when dismissal is declined',()=>{
 const backup=source.slice(source.indexOf('function fullBackupInfo()'),source.indexOf('async function downloadFullBackup()'));
 const importer=source.slice(source.indexOf('function importData()'),source.indexOf('function backupRecordCount('));let modals=0;
 const c=vm.createContext({needReady:()=>true,requestModalClose:()=>false,modal:()=>modals++,document:{createElement(){throw Error('must not open a picker')}},close(){throw Error('must not force-close')}});vm.runInContext(backup+importer,c);c.fullBackupInfo();c.importData();assert.equal(modals,0);
});
