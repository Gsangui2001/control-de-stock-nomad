const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const crewExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/boat-crew-state.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:crewExports});
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'lib/boat-task-access.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject});
const {canUseBoatTask,mergeCrewTasks}=exportsObject;
const tasks=[
  {id:'shared',title:'Compartida',assignee:''},
  {id:'captain',title:'Motor',assignedRole:'capitan',assignee:''},
  {id:'chef',title:'Cocina',assignedRole:'chef',assignee:''},
  {id:'sailor',title:'Cubierta',assignedRole:'marinero',assignee:''},
  {id:'personal',title:'Personal',assignedRole:'chef',assignee:'Otra persona'},
  {id:'legacy',title:'Asignación anterior',assignee:'Capitán'},
];
const user={id:'test',name:'Prueba'};
assert.deepEqual(tasks.filter(t=>canUseBoatTask(t,user,'chef')).map(t=>t.id),['shared','chef']);
assert.deepEqual(tasks.filter(t=>canUseBoatTask(t,user,'capitan')).map(t=>t.id),['shared','captain','legacy']);
assert.equal(tasks.filter(t=>canUseBoatTask(t,user,'lector')).length,6);
const incoming=tasks.filter(t=>canUseBoatTask(t,user,'chef')).map(t=>({...t,done:true,lastCompleted:'2026-10-14'}));
const merged=mergeCrewTasks(tasks,incoming,user,'chef');
assert.equal(merged.length,6);
assert.equal(merged.find(t=>t.id==='chef').done,true);
assert.equal(merged.find(t=>t.id==='captain'),tasks[1]);
assert.throws(()=>mergeCrewTasks(tasks,[...incoming,tasks[1]],user,'chef'));
assert.throws(()=>mergeCrewTasks(tasks,incoming.slice(1),user,'chef'));
assert.throws(()=>mergeCrewTasks(tasks,incoming.map(t=>({...t,assignedRole:'capitan'})),user,'chef'));
const sandbox={document:{addEventListener(){}},session:{...user,admin:false},role:'chef',state:{tasks,manual:{content:'MANUAL OPERATIVO DE TRIPULACIÓN\nPortada\n1. OBJETIVO\nComún\n5. Gestión del Mantenimiento\nComún\n7. RESPONSABILIDADES DEL CAPITÁN\nCapitán\n8. RESPONSABILIDADES DEL CHEF\nChef\n8. RESPONSABILIDADES DEL MARINERO\nMarinero\n12. CHECKLISTS OPERATIVOS\n1. Revisar\n2. Limpiar'}},esc:s=>s,date:s=>s,taskStatus:()=>''};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'public/a-bordo/daily.js'),'utf8'),sandbox);
assert.equal(vm.runInContext('dayTasks().map(t=>t.id).join(",")',sandbox),'shared,chef');
let html=vm.runInContext('dayManualBody()',sandbox);
assert.ok(!html.includes('MANUAL OPERATIVO DE TRIPULACIÓN'));
assert.ok(!html.includes('5. GESTIÓN DEL MANTENIMIENTO'));
assert.ok(html.includes('8. RESPONSABILIDADES DEL CHEF'));
assert.ok(!html.includes('7. RESPONSABILIDADES DEL CAPITÁN'));
assert.ok(!html.includes('8. RESPONSABILIDADES DEL MARINERO'));
assert.ok(!html.includes('1. OBJETIVO'));
assert.ok(!html.includes('1. Revisar\n2. Limpiar'));
vm.runInContext('dayManualRole="all"',sandbox);
assert.ok(vm.runInContext('dayManualBody()',sandbox).includes('7. RESPONSABILIDADES DEL CAPITÁN'));
assert.ok(vm.runInContext('dayManualBody()',sandbox).includes('1. Revisar\n2. Limpiar'));
// Compare client and server task eligibility for every supported crew role.
for(const role of ['capitan','chef','marinero','lector']) {
  sandbox.role=role;
  for(const task of tasks) {
    sandbox.task=task;
    assert.equal(vm.runInContext('dayOwnTask(task)',sandbox),canUseBoatTask(task,user,role));
  }
}
console.log('PASS: role visibility, legacy assignments, protected updates, manual cover/titles/chapters and client/server parity');

// Exercise the actual HTTP handler with an in-memory RPC; no real credentials,
// sessions, accounts or production writes are involved.
(async()=>{
  let account={...user,admin:false}, currentRole='chef', revision=1;
  let saved={schema:1,boat:{name:'Fixture',currency:'USD',equipment:[]},tasks:structuredClone(tasks),logs:[],products:[],purchases:[],movements:[],cameras:[{id:'private-camera'}],manual:{content:'Original'}};
  const rpc=async(op,payload)=>{
    if(op==='session')return {user:account};
    if(op==='state_get')return {state:structuredClone(saved),revision,role:currentRole};
    if(op==='state_put') {
      if(currentRole==='lector')throw {code:'42501',message:'Solo lectura'};
      if(payload.revision!==revision)throw {code:'40001',message:'Conflicto'};
      saved=structuredClone(payload.state); revision++;
      return {state:structuredClone(saved),revision};
    }
    if(op==='user_create')return {ok:true};
    throw Error('Unexpected RPC '+op);
  };
  const routeExports={};
  const mockRequire=name=>name==='@supabase/supabase-js'?{createClient:()=>({rpc:(_fn,{operation,payload})=>({abortSignal:async()=>{try{return {data:await rpc(operation,payload),error:null};}catch(error){return {data:null,error};}}})})}:name==='next/server'?{NextResponse:{json:(data,opts)=>({data,status:opts.status})}}:name==='@/lib/boat-task-access'?exportsObject:name==='@/lib/boat-push'?{flushBoatPush:async()=>({})}:name==='@/lib/boat-crew-state'?crewExports:require(name);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'app/api/boat/[operation]/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:routeExports,require:mockRequire,process:{env:{BOAT_CONTROL_SERVER_SECRET:'test-only'}},Buffer,URL,structuredClone,AbortSignal});
  const call=async(method,body,operation='state')=>routeExports[method]({method,nextUrl:new URL('https://fixture/api/boat/'+operation+'?boat=00000000000000000000000000000001'),cookies:{get:()=>undefined},headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(body)},{params:{operation}});
  let response=await call('GET');
  assert.equal(response.status,200);
  assert.equal(response.data.state.tasks.map(t=>t.id).join(','),'shared,chef');
  assert.equal(response.data.state.cameras.length,0);
  let changed=structuredClone(response.data.state);
  changed.tasks.find(t=>t.id==='chef').done=true;
  changed.logs.push({id:'work',taskId:'chef',title:'Done',date:'2026-10-14',lines:[],photos:[],recordedBy:'Spoof'});
  changed.manual.content='Not allowed';
  response=await call('PUT',{state:changed,revision});
  assert.equal(response.status,200);
  assert.equal(saved.tasks.length,6);
  assert.equal(saved.tasks.find(t=>t.id==='captain').done,undefined);
  assert.equal(saved.tasks.find(t=>t.id==='chef').done,true);
  assert.equal(saved.manual.content,'Original');
  assert.equal(saved.cameras.length,1);
  assert.equal(saved.logs[0].recordedBy,user.name);
  assert.equal(response.data.state.tasks.length,2);
  const current=structuredClone(response.data.state);
  changed=structuredClone(current);changed.tasks[0].assignedRole='capitan';
  assert.equal((await call('PUT',{state:changed,revision})).status,403);
  changed=structuredClone(current);changed.tasks.pop();
  assert.equal((await call('PUT',{state:changed,revision})).status,403);
  changed=structuredClone(current);changed.logs.push({id:'other',taskId:'captain',title:'Wrong role',date:'2026-10-14',lines:[],photos:[]});
  assert.equal((await call('PUT',{state:changed,revision})).status,403);
  assert.equal((await call('PUT',{state:current,revision:0})).status,409);
  account.admin=true;currentRole='administrador';
  response=await call('GET');
  assert.equal(response.data.state.tasks.length,6);
  changed=response.data.state;changed.tasks[1].assignedRole='marinero';
  assert.equal((await call('PUT',{state:changed,revision})).status,200);
  assert.equal((await call('POST',{name:'Fixture',username:'fixture',password:'dummy-not-a-real-password',role:'chef'},'users')).status,201);
  console.log('PASS: API role filtering, save/merge, hidden tasks, manual/camera protection, actor stamping, conflicts and Chef validation');
})().catch(error=>{console.error(error);process.exitCode=1;});
