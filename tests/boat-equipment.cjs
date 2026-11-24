const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const R = require('../public/a-bordo/boat-rules.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const boat = '0123456789abcdef0123456789abcdef';
const imageId = '01234567-1234-1234-1234-123456789abc';
const photoUrl = '/api/boat/photos?boat=' + boat + '&id=' + imageId;
const portablePhoto = 'data:image/jpeg;base64,/9j/2Q==';
const entry = {id:'survey-rainman', name:'Rainman', hours:null, location:'Pañol', identificationNote:'Puesta en marcha filmada', photo:photoUrl};
const state = {schema:1, boat:{name:'Prueba',currency:'USD',equipment:[entry]}, products:[], tasks:[], logs:[], purchases:[], movements:[], cameras:[]};
const checkPhoto = value => value === photoUrl;
const tomorrow = '2026-11-24', today = '2026-11-23';
for (const value of [null, undefined, 0, 17.4]) {
  assert.equal(R.validEquipmentList([{...entry,hours:value}],checkPhoto),true);
}
for (const value of ['', '0', false, -1, Infinity, NaN, 1e12]) {
  assert.equal(R.validEquipmentList([{...entry,hours:value}],checkPhoto),false);
}
assert.equal(R.validEquipmentList([entry,entry],checkPhoto),false);
assert.equal(R.editedHours('',undefined),null);
assert.equal(R.editedHours('0',null),0);
assert.equal(R.editedHours('12.5',12),12.5);
assert.throws(()=>R.editedHours('',0));
assert.throws(()=>R.editedHours('1',12));
assert.equal(R.due({nextHours:0},today,null),'Lectura pendiente');
assert.equal(R.due({nextHours:0},today,0),'Vencido');
assert.equal(R.due({nextHours:8},today,0),'Próximo');
assert.equal(R.due({nextHours:0,nextDate:tomorrow},today,undefined),'Próximo');
assert.equal(R.due({nextHours:0,nextDate:today},today,null),'Hoy');
assert.equal(R.due({nextHours:0,nextDate:'2026-11-20'},today,null),'Vencido');
const task = {intervalHours:100,done:false};
for (const value of ['',undefined,null,false,'0',NaN]) {
  assert.throws(()=>R.completeTask(task,today,value));
  assert.deepEqual(task,{intervalHours:100,done:false});
}
R.completeTask(task,today,0);
assert.equal(task.nextHours,100);

const serverRequire = name => name === '@/public/a-bordo/boat-rules.js' ? R : {};
const restore = {};
function compile(file, extra='', environment={}) {
  const js = ts.transpileModule(read(file)+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  return vm.runInNewContext(js,{exports:restore,require:serverRequire,...environment});
}
compile('lib/boat-restore-validation.ts');
compile('app/api/boat/[operation]/route.ts', '\nexports.checkForTest=validateState;');
const validateApi = restore.checkForTest;
const validateRestore = restore.validateRestoredBoatState;
for (const validate of [validateApi,validateRestore]) {
  assert.doesNotThrow(()=>validate(state,boat));
  for (const bad of [{hours:'0'},{photo:'https://example.org/test.jpg'},{photo:portablePhoto},{photo:photoUrl.replace(boat,'0'.repeat(32))},{photo:false},{location:3},{identificationNote:'a'.repeat(1001)}]) {
    assert.throws(()=>validate({...state,boat:{...state.boat,equipment:[{...entry,...bad}]}},boat));
  }
}

const app = read('public/a-bordo/app.js');
function section(start,end) {
  const pos = app.indexOf(start), next = app.indexOf(end,pos+start.length);
  assert.ok(pos>=0 && next>pos,start);
  return app.slice(pos,next);
}
const elements = {}, drafts = new Map(), savedEquipment = [], uploaded = [];
let serverRevision=1;
const sandbox = {
  R, boatId:boat, revision:serverRevision, state:structuredClone(state), structuredClone,
  draftKey:()=> 'form:equipment', draftRead:async key=>drafts.get(key),
  draftWrite:async(key,value)=>{if(value===null)drafts.delete(key);else drafts.set(key,value);},
  editStoredDraft:async(key,update)=>{
    const next=update(drafts.get(key)||null);
    if(next===null)drafts.delete(key);else drafts.set(key,next);
    return next;
  },
  render() {},
  $: selector => elements[selector] ??= {close(){}},
  esc: s=>String(s??'').replaceAll('<','&lt;'),
  empty: String, action:()=>'', writable:()=>true, session:{id:'equipment-admin',admin:true}, role:'admin', restore(){},
  api: async (op,method,body) => {
    if(op==='photos'){
      assert.equal(method,'POST');assert.equal(body.boat,boat);assert.equal(body.data,portablePhoto);
      uploaded.push(body.boat);return {url:photoUrl};
    }
    assert.equal(op,'state?boat='+boat);assert.equal(method,'PUT');
    assert.equal(body.revision,serverRevision);assert.ok(body.key);
    assert.equal(drafts.get('pending-state:equipment-admin:'+boat)?.key,body.key);
    validateApi(body.state,boat);
    const stored=structuredClone(body.state);
    savedEquipment.push(stored.boat.equipment);
    return {state:stored,revision:++serverRevision};
  },
  fetch: async value => {
    assert.equal(value,photoUrl); return {ok:true,blob:async()=>({})};
  },
  FileReader:class {readAsDataURL() {this.result=portablePhoto;this.onload();}}
};
vm.createContext(sandbox);
vm.runInContext(section('function boatWriteContext','let boatLoadSequence')+
    section('function safePhoto','function safeUrl')+
    section('function validateBackup','async function restore')+
    section('function renderSettings','async function renderCrew'),sandbox);
// Some deployments add survey controls after the boat settings panel renders.
sandbox.mountEquipmentSurvey=()=>{};
const run = source=>vm.runInContext(source,sandbox);
(async()=>{
  run('renderSettings()');
  assert.match(elements['#content'].innerHTML,/Horas sin registrar/);
  assert.ok(elements['#content'].innerHTML.includes(entry.location) && elements['#content'].innerHTML.includes(photoUrl));
  const downloaded = await run('portableBackup()');
  assert.equal(downloaded.boat.equipment[0].photo,portablePhoto);
  assert.equal(sandbox.state.boat.equipment[0].photo,photoUrl);
  sandbox.downloaded = downloaded;
  run('validateBackup(downloaded)');
  await run('uploadPhotos(downloaded,boatWriteContext())');
  assert.equal(downloaded.boat.equipment[0].photo,photoUrl);
  assert.equal(downloaded.boat.equipment[0].hours,null);
  sandbox.downloaded.boat.equipment[0].photo=photoUrl.replace(boat,'0'.repeat(32));
  assert.throws(()=>run('validateBackup(downloaded)'));
  // Submit the real equipment editor for new and legacy records.
  Object.assign(sandbox,{
    editing:null, draftTimer:null, clearTimeout, uid:(()=>{let n=0;return ()=>n++===0?'new-gear':'request-'+n;})(),
    field:(label,name,value)=>`<input name="${name}" value="${value??''}">`,
    select:()=>'', systemOptions:()=>[], FormData:class {
      constructor(form){return Object.entries(form.fields);}
    },
    photo:async()=>portablePhoto, toast(){}
  });
  sandbox.$('#editor').showModal=()=>{};
  vm.runInContext(section('function openEditor','function addLine')+
    section('$("#editorForm").onsubmit =','function addDays'),sandbox);
  run('openEditor("equipment")');
  assert.match(elements['#editorFields'].innerHTML,/name="hours" value=""/);
  const form = {fields:{name:'Bomba',system:'Agua',model:'',location:'Bodega',identificationNote:'Etiqueta 7',hours:''},elements:{equipmentPhoto:{files:[{}]}}};
  await elements['#editorForm'].onsubmit({target:form,preventDefault(){}});
  let gear=sandbox.state.boat.equipment.find(e=>e.id==='new-gear');
  assert.equal(gear.hours,null); assert.equal(gear.identificationNote,'Etiqueta 7'); assert.equal(gear.photo,photoUrl);
  run('openEditor("equipment",state.boat.equipment.find(e=>e.id==="new-gear"))');
  form.fields.hours='0'; form.fields.location='Bodega técnica'; form.elements.equipmentPhoto.files=[];
  await elements['#editorForm'].onsubmit({target:form,preventDefault(){}});
  gear=sandbox.state.boat.equipment.find(e=>e.id==='new-gear');
  assert.equal(gear.hours,0); assert.equal(gear.location,'Bodega técnica'); assert.equal(gear.photo,photoUrl);
  form.fields.hours='';
  run('openEditor("equipment",state.boat.equipment.find(e=>e.id==="new-gear"))');
  await elements['#editorForm'].onsubmit({target:form,preventDefault(){}});
  assert.equal(sandbox.state.boat.equipment.find(e=>e.id==='new-gear').hours,0);
  assert.match(elements['#formError'].textContent,/última lectura/);
  assert.equal(savedEquipment.length,2);
  assert.deepEqual(savedEquipment.map(list=>list.find(e=>e.id==='new-gear').hours),[null,0]);
  assert.deepEqual(uploaded,[boat,boat]);
  assert.equal(sandbox.revision,3);
  assert.equal(drafts.size,0);

  // Exercise the full-backup endpoint with a local RPC fixture.
  const captured=[];
  const opsModules={
    'zod':require('zod'), 'node:crypto':require('node:crypto'),
    'next/server':{NextResponse:{json:(data,opts)=>({data,status:opts.status})}},
    '@/lib/boat-restore-validation':restore, '@/lib/boat-push':{flushBoatPush:async()=>{}},
    '@supabase/supabase-js':{createClient:()=>({rpc:(_name,args)=>({
      abortSignal:async()=>{captured.push(args.payload);return {data:{ok:true}};}
    })})}
  };
  compile('app/api/boat-ops/[operation]/route.ts','',{
    require:name=>opsModules[name],URL,Buffer,AbortSignal,process:{env:{BOAT_CONTROL_SERVER_SECRET:'fixture'}}
  });
  const body={boat,key:imageId,revision:1,backup:{version:1,boat,revision:0,state:structuredClone(state),
    requests:[],transfers:[],reservations:[],instructions:[],collections:[],photos:[{boat_id:boat,id:imageId,data:portablePhoto}]}};
  body.backup.state.boat.model='Modelo anterior';
  const http=()=>restore.POST({method:'POST',nextUrl:new URL('https://fixture.test/api/boat-ops/backup_restore'),
    headers:{get:key=>key==='content-type'?'application/json':null},text:async()=>JSON.stringify(body),cookies:{get:()=>undefined}},{params:{operation:'backup_restore'}});
  assert.equal((await http()).status,200);
  assert.equal(captured[0].backup.state.boat.model,'Modelo anterior');
  assert.equal(captured[0].backup.state.boat.equipment[0].photo,photoUrl);
  body.backup.photos=[];
  assert.equal((await http()).status,400);
  body.backup.photos=[{boat_id:'0'.repeat(32),id:imageId,data:portablePhoto}];
  assert.equal((await http()).status,400);
  assert.equal(captured.length,1);
  console.log('PASS: equipment create/edit, readings, photo ownership, full and portable restore, hour-based routines and render.');
})().catch(error=>{console.error(error);process.exitCode=1;});
