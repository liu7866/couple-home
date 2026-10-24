import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile('public/app.js','utf8'),helper=await readFile('public/room-helpers.js','utf8');
const code=source.slice(source.indexOf('function connectionProblem('),source.indexOf('function showConnectionRetry('));
function fixture(response){let locks=0;const c=vm.createContext({Headers,AbortSignal,Error,backendFetch:async()=>{if(response instanceof Error)throw response;return response},showLogin:()=>locks++});vm.runInContext(helper,c);vm.runInContext('const {requestFailureMessage}=LittleDaysHelpers;'+code,c);return{c,get locks(){return locks}}}
test('HTML blocks and failed fetches preserve authentication and report a connection problem',async()=>{
 for(const response of [new Response('blocked',{status:403,headers:{'content-type':'text/html'}}),new Response('<html>signin</html>',{headers:{'content-type':'text/html'}}),new TypeError('Failed to fetch')]){const f=fixture(response);await assert.rejects(()=>f.c.api('/api/home'),e=>e.connection===true&&e.status!==401);assert.equal(f.locks,0)}
});
test('only an authenticated API rejection expires a session; a bad login keeps its form',async()=>{
 const f=fixture(Response.json({error:'已过期'},{status:401}));await assert.rejects(()=>f.c.api('/api/home'),e=>e.status===401);assert.equal(f.locks,1);
 const login=fixture(Response.json({error:'密码不正确'},{status:401}));await assert.rejects(()=>login.c.api('/api/auth'),e=>e.status===401);assert.equal(login.locks,0);
});
