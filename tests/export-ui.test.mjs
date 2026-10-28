import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile('public/app.js','utf8');const code=source.slice(source.indexOf('async function exportData()'),source.indexOf('let legacy='));
function fixture(kind='ok'){
 const button={},note={append:()=>{}},callbacks=[];const dialog={dataset:{},addEventListener:(name,fn)=>callbacks.push(fn)};let file=null,downloads=0,revoked=0;
 const state={photos:[{id:'one',caption:'回忆'}],letters:[{text:'已揭晓'}, {text:'未来见',locked:true}],pet:{name:'团团'}};
 const c=vm.createContext({needReady:()=>true,queue:Promise.resolve(),state,structuredClone,Blob,AbortSignal,JSON,URL:{createObjectURL:blob=>{file=blob;return 'blob:test'},revokeObjectURL:()=>revoked++},blobData:async b=>'data:'+b.type+';base64,'+Buffer.from(await b.arrayBuffer()).toString('base64'),today:()=> '2026-10-24',$:s=>s==='#export'?button:s==='#modal'?dialog:note,document:{createElement:()=>({click:()=>downloads++})},backendFetch:async()=>kind==='html'?new Response('<html>blocked</html>',{headers:{'content-type':'text/html'}}):new Response(kind==='empty'?new Uint8Array():new Uint8Array(kind==='corrupt'?[1,2,3]:[255,216,255]),{headers:{'content-type':kind==='parameters'?'image/jpeg; charset=binary':kind==='uppercase'?'IMAGE/JPEG':'image/jpeg'}})});vm.runInContext(code,c);
 return{run:()=>c.exportData(),button,dialog,note,get file(){return file},get downloads(){return downloads},get revoked(){return revoked},close:()=>callbacks.forEach(fn=>fn())};
}
test('ordinary export excludes sealed letters and keeps the fallback download alive until close',async()=>{
 const f=fixture();await f.run();const data=JSON.parse(await f.file.text());assert.equal(data.photos.length,1);assert.equal(data.letters.length,1);assert.equal(data.letters[0].text,'已揭晓');assert.equal(f.downloads,1);assert.equal(f.revoked,0);f.close();assert.equal(f.revoked,1);assert.equal(f.button.disabled,false);assert.equal(f.dialog.dataset.busy,'0');
});
for(const kind of ['parameters','uppercase'])test('ordinary export normalizes '+kind+' JPEG media type for import',async()=>{const f=fixture(kind);await f.run();assert.ok(f.file);const data=JSON.parse(await f.file.text());assert.ok(data.photos[0].data.startsWith('data:image/jpeg;base64,'))});
for(const kind of ['html','empty','corrupt'])test('ordinary export rejects '+kind+' image responses instead of producing a broken backup',async()=>{
 const f=fixture(kind);await f.run();assert.equal(f.file,null);assert.equal(f.downloads,0);assert.match(f.note.textContent,/没有生成/);assert.equal(f.button.disabled,false);assert.equal(f.dialog.dataset.busy,'0');
});
test('backup and import transitions preserve a settings form when dismissal is declined',()=>{
 const backup=source.slice(source.indexOf('function fullBackupInfo()'),source.indexOf('async function downloadFullBackup()'));
 const importer=source.slice(source.indexOf('function importData()'),source.indexOf('function backupRecordCount('));let modals=0;
 const c=vm.createContext({needReady:()=>true,requestModalClose:()=>false,modal:()=>modals++,document:{createElement(){throw Error('must not open a picker')}},close(){throw Error('must not force-close')}});vm.runInContext(backup+importer,c);c.fullBackupInfo();c.importData();assert.equal(modals,0);
});
test('backup preview accepts up to 2000 photos and rejects 2001',()=>{
 const code=source.slice(source.indexOf('function importConfirm('),source.indexOf('function importData()'));let opened=0,message='';
 const node={};const c=vm.createContext({revision:1,me:{},modal:()=>opened++,toast:x=>message=x,esc:String,close(){},$:()=>node,Number,Object,Array});vm.runInContext(code,c);
 const backup={v:2,names:['A','B'],photos:[],stories:[],wishes:[],letters:[],anniversaries:[]};
 for(const count of [201,2000]){backup.photos=Array(count).fill({});c.importConfirm(backup);assert.equal(opened,count===201?1:2)}
 backup.photos=Array(2001).fill({});c.importConfirm(backup);assert.equal(opened,2);assert.match(message,/备份内容不完整/);
});
test('a 201-photo backup can complete the merge after validation',async()=>{
 const code=source.slice(source.indexOf('function importConfirm('),source.indexOf('function importData()'));
 const nodes={'#confirm-import':{},'#cancel-import':{},'#restore-progress':{},'#modal':{dataset:{}}};let uploaded=0,merged=false,notice='';
 const c=vm.createContext({revision:1,me:{},state:{photos:[]},modal(){},toast:x=>notice=x,esc:String,close(){},fetch,Blob,crypto,Date,Map,
  $:s=>nodes[s]||null,uploadPhoto:async()=>({id:'uploaded-'+(++uploaded),existed:false}),mutate:async(kind,payload)=>{assert.equal(kind,'import');assert.equal(payload.data.photos.length,0);merged=true},refreshNow:async()=>{},checkMigration(){}});
 vm.runInContext(code,c);const backup={v:2,names:['A','B'],photos:Array.from({length:201},(_,i)=>({id:'fixture-'+i,data:'data:image/jpeg;base64,/9j/'})),stories:[],wishes:[],letters:[],anniversaries:[]};
 c.importConfirm(backup);await nodes['#confirm-import'].onclick();assert.equal(uploaded,201);assert.equal(merged,true);assert.match(notice,/回忆已合并/);
});
test('corrupt second photo fails validation before any photo is uploaded',async()=>{
 const code=source.slice(source.indexOf('function importConfirm('),source.indexOf('function importData()'));
 const nodes={'#confirm-import':{},'#cancel-import':{},'#restore-progress':{},'#modal':{dataset:{}}};let uploaded=0,merged=false;
 const c=vm.createContext({revision:1,me:{},state:{photos:[]},modal(){},toast(){},esc:String,close(){},fetch,crypto,Date,Map,
  $:s=>nodes[s]||null,uploadPhoto:async()=>{uploaded++;return{id:'fixture',existed:false}},mutate:async()=>{merged=true},refreshNow:async()=>{},checkMigration(){}});
 vm.runInContext(code,c);const backup={v:2,names:['A','B'],photos:[{id:'valid',data:'data:image/jpeg;base64,/9j/'},{id:'corrupt',data:'data:image/jpeg;base64,Zm9v'}],stories:[],wishes:[],letters:[],anniversaries:[]};
 c.importConfirm(backup);await nodes['#confirm-import'].onclick();assert.equal(uploaded,0);assert.equal(merged,false);assert.match(nodes['#restore-progress'].textContent,/照片/);
});
test('existing backup JPEG data URLs with media type parameters remain importable',async()=>{
 const code=source.slice(source.indexOf('function importConfirm('),source.indexOf('function importData()'));
 const nodes={'#confirm-import':{},'#cancel-import':{},'#restore-progress':{},'#modal':{dataset:{}}};let uploaded=0,merged=false;
 const c=vm.createContext({revision:1,me:{},state:{photos:[]},modal(){},toast(){},esc:String,close(){},fetch,Blob,crypto,Date,Map,
  $:s=>nodes[s]||null,uploadPhoto:async blob=>{assert.equal(blob.type,'image/jpeg');uploaded++;return{id:'fixture',existed:false}},mutate:async()=>{merged=true},refreshNow:async()=>{},checkMigration(){}});
 vm.runInContext(code,c);const backup={v:2,names:['A','B'],photos:[{id:'legacy',data:'data:image/jpeg;charset=binary;base64,/9j/'}],stories:[],wishes:[],letters:[],anniversaries:[]};
 c.importConfirm(backup);await nodes['#confirm-import'].onclick();assert.equal(uploaded,1);assert.equal(merged,true);
});
