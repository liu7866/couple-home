import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile('public/app.js','utf8'),helper=await readFile('public/room-helpers.js','utf8');
const code=source.slice(source.indexOf('function attachDraft('),source.indexOf('\nfunction render(){'));
test('starting and saving a new story preserves an unrecovered older draft',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const toggle={checked:false},note={},restore={remove(){}},clear={},box={querySelector:s=>({'input':toggle,'.draft-status':note,'#restore-draft':restore,'#clear-draft':clear})[s]};
 const inputs={date:{value:'2026-10-24'},title:{value:''},text:{value:''}};const handlers={};
 const form={dataset:{},elements:{namedItem:name=>inputs[name]},querySelector:()=>({before(){}}),addEventListener:(type,fn)=>handlers[type]=fn};
 class Values{constructor(f){this.values=Object.entries(inputs).map(([k,input])=>[k,input.value])}[Symbol.iterator](){return this.values[Symbol.iterator]()}}
 let allowRestore=false;const c=vm.createContext({me:{slot:1},API_ORIGIN:'test',localStorage:storage,document:{createElement:()=>box},FormData:Values,formSnapshot:()=>JSON.stringify(Object.values(inputs).map(i=>i.value)),confirm:()=>allowRestore});
 vm.runInContext(helper,c);vm.runInContext('const {createDraftStore}=LittleDaysHelpers;'+code,c);
 const store=c.LittleDaysHelpers.createDraftStore(storage,'test:1');store.write('story',{title:'原来的草稿',text:'不能丢掉这段话',date:'2026-10-23'});
 c.attachDraft(form,'story');inputs.title.value='新的回忆';inputs.text.value='另一段已经写好的内容';handlers.input({target:inputs.text});assert.equal(store.read('story').title,'原来的草稿');
 toggle.checked=true;toggle.onchange();assert.equal(toggle.checked,false);assert.match(note.textContent,/请先恢复或清除/);form.clearDraft();assert.equal(store.read('story').text,'不能丢掉这段话');
 restore.onclick();assert.equal(inputs.title.value,'新的回忆');allowRestore=true;restore.onclick();assert.equal(inputs.title.value,'原来的草稿');assert.equal(inputs.text.value,'不能丢掉这段话');form.clearDraft();assert.equal(store.read('story'),null);
});
