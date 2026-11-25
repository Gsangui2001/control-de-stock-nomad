// Route validation for cash handovers. The Supabase RPC is a local fixture; nothing leaves the process.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function route(){
 const calls=[],handler={};
 const modules={'zod':require('zod'),'node:crypto':require('node:crypto'),
  'next/server':{NextResponse:{json:(data,opts)=>({data,status:opts.status})}},
  '@/lib/boat-restore-validation':{validateRestoredBoatState(){}},'@/lib/boat-push':{flushBoatPush:async()=>{}},
  '@supabase/supabase-js':{createClient:()=>({rpc:(name,args)=>({abortSignal:async()=>{calls.push({name,...args});return {data:{ok:true,entryId:1}};}})})}};
 const source=fs.readFileSync('app/api/boat-ops/[operation]/route.ts','utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:handler,require:name=>modules[name],process:{env:{BOAT_CONTROL_SERVER_SECRET:'fixture-only'}},URL,Buffer,AbortSignal});
 const post=body=>handler.POST({method:'POST',nextUrl:new URL('https://fixture.test/api/boat-ops/captain_handover'),
  headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(body),cookies:{get:()=>({value:'local-fixture'})}},
  {params:{operation:'captain_handover'}});
 return {calls,post};
}
const form={boat:'a'.repeat(32),key:'00000000-0000-4000-8000-000000000010',captainId:'user-capitan',currency:'USD',amount:1000.5};
test('the handover form reaches the captain cash RPC; invalid amounts, notes and fields stop at the route',async()=>{
 const {calls,post}=route();
 assert.equal((await post({...form,note:'  Sobre cerrado  '})).status,200);
 assert.equal((await post({...form,note:''})).status,200);
 assert.equal((await post(form)).status,200);
 assert.deepEqual(calls.map(c=>[c.name,c.operation,c.payload.note]),[['boat_captain_cash_rpc','captain_handover','Sobre cerrado'],
  ['boat_captain_cash_rpc','captain_handover',''],['boat_captain_cash_rpc','captain_handover',undefined]]);
 assert.match(calls[0].payload.session,/^[a-f0-9]{64}$/);
 for(const bad of [{amount:0},{amount:-1},{amount:0.001},{amount:1e9+1},{currency:'BRL'},{note:'x'.repeat(141)},{captainId:''},{concept:'Entrega'}])
  assert.equal((await post({...form,...bad})).status,400,JSON.stringify(bad));
 assert.equal(calls.length,3);
});
