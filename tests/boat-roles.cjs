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
assert.ok(html.includes('5. GESTIÓN DEL MANTENIMIENTO'));
assert.ok(html.includes('8. RESPONSABILIDADES DEL CHEF'));
assert.ok(!html.includes('7. RESPONSABILIDADES DEL CAPITÁN'));
assert.ok(!html.includes('8. RESPONSABILIDADES DEL MARINERO'));
assert.ok(html.includes('1. OBJETIVO'));
assert.ok(html.includes('1. Revisar\n2. Limpiar'));
assert.ok(html.indexOf('8. RESPONSABILIDADES DEL CHEF') < html.indexOf('1. OBJETIVO'));
assert.ok(html.includes('Cómo usar A bordo · Chef'));
const originalManual=sandbox.state.manual.content;
sandbox.state.manual.content+='\nAPÉNDICE A\n\nRUTINA DIARIA DEL MARINERO\n1. APERTURA\nAbrir\n11. ORGANIZACIÓN\nCoordinar\nAPÉNDICE B\n\nPROGRAMA DE LIMPIEZA\nDía 14 | Limpieza de ánodos';
assert.ok(!vm.runInContext('dayManualBody()',sandbox).includes('Día 14 | Limpieza de ánodos'));
vm.runInContext('dayManualRole="marinero"',sandbox);
html=vm.runInContext('dayManualBody()',sandbox);
assert.ok(html.includes('APÉNDICE A · RUTINA DIARIA DEL MARINERO'));
assert.ok(html.includes('APÉNDICE B · PROGRAMA DE LIMPIEZA'));
assert.ok(html.includes('11. ORGANIZACIÓN\nCoordinar'));
assert.ok(html.includes('Día 14 | Limpieza de ánodos'));
assert.ok(!html.includes('8. RESPONSABILIDADES DEL CHEF'));
vm.runInContext('dayManualRole="capitan"',sandbox);
assert.ok(vm.runInContext('dayManualBody()',sandbox).includes('Día 14 | Limpieza de ánodos'));
sandbox.state.manual.content=originalManual;
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
  const receipts=new Map();
  let expenseReads=0;
  let requestPhoto='';
  const rpc=async(op,payload,fn,requestHash,lookupOnly)=>{
    if(fn==='boat_state_commit_rpc'){
      const previous=receipts.get(payload.key);
      if(previous){
        if(previous.hash!==requestHash)throw {code:'PT409',message:'Clave reutilizada'};
        return previous.result;
      }
      if(lookupOnly)return null;
      const result=await rpc('state_put',payload);
      receipts.set(payload.key,{hash:requestHash,result});
      return result;
    }
    if(fn==='boat_expenses_rpc'&&op==='list'){expenseReads++;return {expenses:saved.purchases};}
    if(fn==='boat_operations_rpc'&&op==='overview')return {requests:[{photo:requestPhoto}]};
    if(op==='session')return {user:account};
    if(op==='state_get')return {state:structuredClone(saved),revision,role:currentRole};
    if(op==='photo_get')return {data:'data:image/jpeg;base64,cGhvdG8='};
    if(op==='state_put') {
      if(currentRole==='lector')throw {code:'42501',message:'Solo lectura'};
      if(payload.revision!==revision)throw {code:'40001',message:'Conflicto'};
      saved=structuredClone(payload.state); revision++;
      return {state:structuredClone(saved),revision};
    }
    if(op==='user_create')return {ok:true};
    throw Error('Unexpected RPC '+op);
  };
  const TestResponse=class{static json(data,opts){return {data,status:opts.status};} constructor(data,opts){this.data=data;this.status=opts.status||200;}};
  const client={rpc(fn,{operation,payload,request_hash,lookup_only}){
    const promise=rpc(operation,payload,fn,request_hash,lookup_only).then(
      data=>({data,error:null}),error=>({data:null,error})
    );
    return Object.assign(promise,{abortSignal:()=>promise});
  }};
  const modules={
    '@/public/a-bordo/boat-rules.js':require('../public/a-bordo/boat-rules.js'),
    '@supabase/supabase-js':{createClient:()=>client},
    'next/server':{NextResponse:TestResponse},
    '@/lib/boat-task-access':exportsObject,
    '@/lib/boat-push':{flushBoatPush:async()=>({})},
    '@/lib/boat-crew-state':crewExports,
    '@/lib/boat-manual-grant':{issueManualGrant(){},clearManualGrant(){}}
  };
  const mockRequire=name=>modules[name]??require(name);
  function loadHandler(name){
    const handler={};
    const source=fs.readFileSync(path.join(root,'app/api',name,'[operation]/route.ts'),'utf8');
    vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:handler,require:mockRequire,process:{env:{BOAT_CONTROL_SERVER_SECRET:'test-only'}},Buffer,URL,structuredClone,AbortSignal});
    return handler;
  }
  const boatHandler=loadHandler('boat'), expenseHandler=loadHandler('boat-expenses');
  const boat='00000000000000000000000000000001';
  const call=async(method,body,operation='state',query='',handler=boatHandler)=>handler[method]({method,nextUrl:new URL('https://fixture/api/boat/'+operation+'?boat='+boat+query),cookies:{get:()=>undefined},headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(body)},{params:{operation}});
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
  const part={id:'spare',name:'Spare',unit:'un',current:4,min:1,cost:2};
  changed=structuredClone((await call('GET')).data.state);
  changed.products.push(part);
  assert.equal((await call('PUT',{state:changed,revision})).status,200,'administrator can load technical stock');
  account.admin=false;
  for (const role of ['capitan','chef','marinero','lector','encargado']) {
    currentRole=role;
    const visible=(await call('GET')).data.state;
    for (const modify of [
      s=>s.products.push({...part,id:'second'}),
      s=>s.products[0].current++,
      s=>s.purchases.push({id:'receipt',date:'2026-10-24',lines:[]})
    ]) {
      const update=structuredClone(visible); modify(update);
      assert.equal((await call('PUT',{state:update,revision})).status,403,role+' cannot load inventory');
    }
  }
  currentRole='encargado';
  changed=structuredClone((await call('GET')).data.state);
  changed.tasks[0].assignedRole='chef';
  assert.equal((await call('PUT',{state:changed,revision})).status,403,'only admin assigns tasks');
  changed=structuredClone((await call('GET')).data.state);
  changed.products[0].current=3;
  changed.logs.push({id:'work-material',title:'Routine',date:'2026-10-24',lines:[{productId:'spare',quantity:1}],photos:[]});
  changed.movements.push({id:'use',productId:'spare',delta:-1});
  assert.equal((await call('PUT',{state:changed,revision})).status,200,'work still consumes stock');
  changed=structuredClone((await call('GET')).data.state);
  changed.logs.push({id:'report',title:'Notice',reportKind:'novedad',date:'2026-10-24',lines:[],photos:[]});
  assert.equal((await call('PUT',{state:changed,revision})).status,200);
  changed=structuredClone((await call('GET')).data.state);
  const report=changed.logs.find(l=>l.id==='report');
  report.resolvedAt='2026-10-25T12:00:00Z'; report.resolvedBy=user.name;
  assert.equal((await call('PUT',{state:changed,revision})).status,200,'manager can resolve a notice');
  const photoId=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const photoUrl=(n)=>'/api/boat/photos?boat='+boat+'&id='+photoId(n);
  const expense={id:'invoice',date:'2026-11-24',total:34,lines:[],photos:[photoUrl(1)]};
  saved.purchases=[expense];
  saved.products[0].photo=photoUrl(2);
  saved.boat.equipment=[{id:'gear',name:'Equipo',hours:3,photo:photoUrl(3)}];
  saved.tasks.find(t=>t.id==='shared').photo=photoUrl(4);
  saved.logs[0].photos=[photoUrl(5)];
  requestPhoto=photoUrl(6);
  for(const role of ['chef','marinero']){
    currentRole=role;
    const visible=(await call('GET')).data.state;
    assert.equal(visible.purchases.length,0);
    assert.equal((await call('GET',null,'list','',expenseHandler)).status,403);
    assert.equal((await call('GET',null,'photos','&id='+photoId(1))).status,403);
    for(const n of [2,3,4,5,6])assert.equal((await call('GET',null,'photos','&id='+photoId(n))).status,200);
    for(const legacy of [false,true]){
      const work=structuredClone((await call('GET')).data.state);
      if(legacy)work.purchases=structuredClone(saved.purchases);
      const key=photoId(10+receipts.size);
      const input={state:work,revision,key};
      for(let retry=0;retry<2;retry++){
        const response=await call('PUT',input);
        assert.equal(response.status,200,role+' can save work and recover it: '+JSON.stringify(response.data?.error));
        assert.equal(response.data.state.purchases.length,0,role+' receives a projected receipt');
        assert.deepEqual(saved.purchases,[expense]);
        assert.equal(revision,input.revision+1);
      }
    }
  }
  assert.equal(expenseReads,0,'blocked roles never fetch the expenses list');
  for(const role of ['capitan','encargado','lector','administrador']){
    currentRole=role;account.admin=role==='administrador';
    assert.equal((await call('GET')).data.state.purchases[0].id,expense.id);
    assert.equal((await call('GET',null,'list','',expenseHandler)).data.expenses[0].id,expense.id);
    assert.equal((await call('GET',null,'photos','&id='+photoId(1))).status,200);
  }
  console.log('PASS: cash access by role, operational photos, preserved expenses on current/legacy saves and receipt retries');
  console.log('PASS: technical inventory protected across roles, work consumption and notice resolution');
  console.log('PASS: API role filtering, save/merge, hidden tasks, manual/camera protection, actor stamping, conflicts and Chef validation');
})().catch(error=>{console.error(error);process.exitCode=1;});
