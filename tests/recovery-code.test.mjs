import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRecoveryCode,normalizeRecoveryCode} from '../lib/recovery-code.mjs';
import {createPassword,verifyPassword} from '../lib/password.mjs';
import {createPassword as createNativePassword,verifyPassword as verifyNativePassword} from '../server/password.mjs';

test('new recovery codes contain 12 unambiguous symbols and accept grouped lowercase input',()=>{
 for(let i=0;i<20;i++)assert.match(createRecoveryCode(),/^[2-9A-HJ-NP-Z]{12}$/);
 assert.equal(normalizeRecoveryCode(' abcd-efgh-jk23 '),'ABCDEFGHJK23');
 assert.equal(normalizeRecoveryCode('abcd efgh jk23'),'ABCDEFGHJK23');
});

test('legacy 64-character codes remain valid while malformed codes are rejected',()=>{
 const legacy='abcdef0123456789'.repeat(4);
 assert.equal(normalizeRecoveryCode(' '+legacy+' '),legacy);
 assert.equal(normalizeRecoveryCode(legacy.toUpperCase()),legacy);
 for(const value of [null,42,{},'', 'A'.repeat(11),'A'.repeat(13),'000000000000','IIIIIIIIIIII','ＡＢＣＤＥＦＧＨＪＫ２３','A'.repeat(129)])assert.equal(normalizeRecoveryCode(value),null);
});

test('both password implementations accept six characters, reject five, and retain cross-runtime compatibility',async()=>{
 for(const [create,verify]of [[createPassword,verifyNativePassword],[createNativePassword,verifyPassword]]){
  await assert.rejects(()=>create('Abc12'),/6 至 128/);
  await assert.rejects(()=>create('a'.repeat(129)),/6 至 128/);
  const record=await create('Abc123');
  assert.equal(await verify('Abc123',{salt:record.salt,password_hash:record.passwordHash}),true);
  assert.equal(await verify('Abc124',{salt:record.salt,password_hash:record.passwordHash}),false);
 }
});

test('recovery display groups new codes and preserves legacy codes for copy and download',async()=>{
 const source=await readFile('public/app.js','utf8'),context=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function recoveryDisplay('),source.indexOf('function recoveryResult(')),context);
 assert.equal(context.recoveryDisplay('ABCDEFGHJK23'),'ABCD-EFGH-JK23');
 const legacy='abcdef0123456789'.repeat(4);assert.equal(context.recoveryDisplay(legacy),legacy);
 const entry=await readFile('public/entry.js','utf8');
 assert.ok(entry.includes('minlength="6"'));assert.ok(!entry.includes('minlength="12"'));
 const passwordForm=source.slice(source.indexOf('function passwordForm('),source.indexOf("$('#key-login-form').onsubmit"));
 assert.ok(passwordForm.includes('minlength="6"'));assert.ok(!passwordForm.includes('minlength="12"'));
 const resetForm=source.slice(source.indexOf("$('#forgot-password').onclick"),source.indexOf("$('#migrate-local').onclick"));
 assert.ok(resetForm.includes('minlength="12" maxlength="128"'));
 assert.equal((resetForm.match(/minlength="6"/g)||[]).length,2);
 let rendered='';const button={},fields=[];
 const resetContext=vm.createContext({$:()=>button,modal(){},form:html=>rendered=html,roleLabel:slot=>slot===1?'管理员':'成员二',esc:String,
  field:(label,name,type,value,extra)=>{fields.push({name,extra});return ''}});
 vm.runInContext(resetForm,resetContext);button.onclick();
 assert.match(rendered,/<option value="1">管理员<\/option>/);assert.ok(!rendered.includes('${'));
 assert.equal(fields.find(x=>x.name==='code').extra.includes('maxlength="128"'),true);
});
