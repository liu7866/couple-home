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
 assert.equal(dialog.open,false);assert.equal(dialog.dataset.busy,'0');assert.equal(gate.hidden,false);assert.equal(note.textContent,'登录已过期，请重新回家。');assert.equal(context.ready,false);assert.equal(classes.has('home-locked'),true);assert.deepEqual(revoked,['blob:private-photo']);assert.equal(cache.size,0);assert.equal(forgotten,pagesMode?1:0);
});
