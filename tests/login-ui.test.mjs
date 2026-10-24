import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile('public/app.js','utf8');
const code=source.slice(source.indexOf('function showLogin('),source.indexOf('function connection('));
for(const pagesMode of [false,true])test(`expired ${pagesMode?'Pages':'same-origin'} session dismisses protected dialogs and revokes cached photo URLs`,()=>{
 const dialog={open:true,dataset:{busy:'1'},close(){this.open=false}},gate={hidden:true},note={},classes=new Set(),revoked=[];
 const cache=new Map([['photo1',{url:'blob:private-photo'}],['photo2',{url:''}]]);let forgotten=0;
 const context=vm.createContext({ready:true,PAGES_MODE:pagesMode,photoCache:cache,forgetDevice(){forgotten++},URL:{revokeObjectURL:url=>revoked.push(url)},document:{body:{classList:{add:name=>classes.add(name)}}},$:selector=>({'#modal':dialog,'#login-gate':gate,'#login-note':note})[selector]});
 vm.runInContext(code,context);context.showLogin('登录已过期，请重新回家。');
 assert.equal(dialog.open,false);assert.equal(dialog.dataset.busy,'0');assert.equal(gate.hidden,false);assert.equal(note.textContent,'登录已过期，请重新回家。');assert.equal(context.ready,false);assert.equal(context.loginRequired,true);assert.equal(classes.has('home-locked'),true);assert.deepEqual(revoked,['blob:private-photo']);assert.equal(cache.size,0);assert.equal(forgotten,pagesMode?1:0);
});

const syncCode=source.slice(source.indexOf('async function sync('),source.indexOf('async function refreshNow()'));
test('the login gate stops repeated background requests and synchronization resumes after sign-in',async()=>{
 let calls=0;const context=vm.createContext({polling:false,pending:0,loginRequired:true,nextSyncAt:0,syncTag:'',requestId:0,api:async()=>{calls++;return {}},accept:()=>{},status:()=>{},connection:()=>{},showConnectionRetry:()=>{},ready:false,$:()=>({})});vm.runInContext(syncCode,context);await context.sync();await context.sync();assert.equal(calls,0);context.loginRequired=false;await context.sync();assert.equal(calls,1);assert.equal(context.polling,false);
});

test('network failures back off automatic polling while an explicit retry still runs',async()=>{
 let calls=0;const context=vm.createContext({polling:false,pending:0,loginRequired:false,nextSyncAt:0,syncFailures:0,syncTag:'abc',requestId:0,ready:true,api:async path=>{calls++;assert.equal(path,'/api/home?since=abc');throw new Error('offline')},accept:()=>{},status:()=>{},connection:()=>{},showConnectionRetry:()=>{},$:()=>({})});
 vm.runInContext(syncCode,context);await context.sync();assert.equal(calls,1);assert.ok(context.nextSyncAt>Date.now());await context.sync();assert.equal(calls,1);await context.sync(true);assert.equal(calls,2);assert.equal(context.loginRequired,false);
});

test('unchanged polls preserve content and update presence without rerendering forms',()=>{
 const acceptCode=source.slice(source.indexOf('function accept('),source.indexOf('async function sync('));const room={stories:[{text:'已保存的回忆'}]};let renders=0,presence=0;const classes={remove(){}};
 const context=vm.createContext({state:room,revision:7,received:1,syncTag:'old',members:[],document:{body:{classList:classes}},$:()=>({hidden:true}),status:()=>{},showConnectionRetry:()=>{},render:()=>renders++,renderMemberStatus:()=>presence++});vm.runInContext(acceptCode,context);
 context.accept({unchanged:true,revision:7,syncTag:'new',me:{slot:1},members:[{slot:2,online:true}]},2);assert.equal(context.state,room);assert.equal(context.ready,true);assert.equal(context.syncTag,'new');assert.equal(context.members[0].online,true);assert.equal(renders,0);assert.equal(presence,1);
});
