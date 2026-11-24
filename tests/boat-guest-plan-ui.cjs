const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function editor(){
 const actions={},row={id:'booking',briefVersion:0,onboardPlan:{fields:{},canEdit:true}};
 const s={session:{id:'captain'},boatId:'nomade',esc:v=>String(v).replaceAll('<','&lt;'),document:{addEventListener:(name,fn)=>actions[name]=fn},
  opsReservations:[],briefAgenda:[row],row,URLSearchParams,uid:()=>crypto.randomUUID(),toast(){},render(){}};
 vm.createContext(s);vm.runInContext(fs.readFileSync(path.join(root,'public/a-bordo/guest-plan.js'),'utf8'),s);
 const run=code=>vm.runInContext(code,s);
 const server={revision:0,version:0,fields:{},values:{embarkation:'Muelle A',drinks:'Agua'},canEdit:true};
 s.fetch=async()=>({ok:true,json:async()=>structuredClone(server)});
 const click=(what,field)=>actions.click({target:{closest:()=>({dataset:{guestPlanAction:what,field},closest:()=>({dataset:{guestPlan:row.id}})})}});
 const submit=()=>actions.submit({preventDefault(){},target:{matches:()=>true,reportValidity:()=>true,elements:{namedItem:key=>({value:run('guestPlanDraft.values')[key]||''})}}});
 const opened=async()=>{click('edit');await new Promise(r=>setImmediate(r));};
 return {actions,run,s,row,server,click,submit,opened};
}
test('pending card keeps only populated operational fields when reopened',()=>{
 const {row,run}=editor();
 row.onboardPlan.fields={embarkation:'<Muelle>',transport:'',drinks:'Agua',onboardNotes:'Recibir a las 10'};
 const html=run('guestPlanPanel(row)');
 assert.match(html,/Lugar de embarque/);assert.match(html,/&lt;Muelle>/);assert.match(html,/Recibir a las 10/);
 assert.ok(!html.includes('Traslado'));assert.match(html,/Editar ficha/);
 row.onboardPlan.canEdit=false;assert.ok(!run('guestPlanPanel(row)').includes('Editar ficha'));
});
test('two editors can compare a changed field and keep unrelated changes without overwriting them',async()=>{
 const {s,server,run,click,submit,opened,row}=editor();
 await opened();run('guestPlanDraft.values.embarkation="Mi muelle"');
 server.revision=1;server.values={embarkation:'Muelle de administración',drinks:'Té'};
 const requests=[];s.opsFetch=async(op,data)=>{
  requests.push(structuredClone(data));
  if(data.revision!==server.revision)throw Object.assign(Error('La ficha cambió.'),{status:409});
  Object.assign(server.fields,data.changes);Object.assign(server.values,data.changes);server.revision++;
  return structuredClone(server);
 };
 await submit();assert.match(run('guestPlanPanel(row)'),/Revisar la versión actual/);
 click('reload');await new Promise(r=>setImmediate(r));
 assert.equal(run('guestPlanDraft.values.embarkation'),'Mi muelle');assert.equal(run('guestPlanDraft.values.drinks'),'Té');
 assert.match(run('guestPlanPanel(row)'),/Muelle de administración/);assert.equal(run('guestPlanDraft.conflicts.size'),1);
 await submit();assert.equal(requests.length,1);
 click('mine','embarkation');await submit();
 assert.equal(requests.length,2);assert.deepEqual(requests[1].changes,{embarkation:'Mi muelle'});assert.equal(requests[1].revision,1);
 assert.equal(row.onboardPlan.revision,2);assert.equal(row.onboardPlan.values.drinks,'Té');
 assert.equal(run('guestPlanDraft'),null);
});
test('ambiguous write retries the original request; a late read cannot populate another session',async()=>{
 const {s,server,run,submit,opened,click}=editor();
 await opened();run('guestPlanDraft.values.onboardNotes="Llegan a las 9"');
 const attempts=[];s.opsFetch=async(op,payload)=>{
  attempts.push(structuredClone(payload));if(attempts.length===1)throw Error('Sin conexión');
  return {...server,fields:payload.changes,revision:1};
 };
 await submit();assert.match(run('guestPlanPanel(row)'),/Reintentar guardado/);await submit();
 assert.deepEqual(attempts[0],attempts[1]);
 let resume;s.fetch=()=>new Promise(resolve=>resume=()=>resolve({ok:true,json:async()=>server}));
 click('edit');s.session={id:'other'};resume();await new Promise(r=>setImmediate(r));
 assert.ok(!run('guestPlanPanel(row)').includes('Muelle A'));assert.equal(run('guestPlanDraft'),null);
});
test('HTTP validates plan fields, authenticates GET and preserves every supported draft field',async()=>{
 const ts=require('typescript'),z=require('zod'),seen=[];
 const api={};const modules={'next/server':{NextResponse:{json:(data,o)=>({data,status:o.status})}},
  '@supabase/supabase-js':{createClient:()=>({rpc:(rpc,args)=>({abortSignal:async()=>{seen.push({rpc,args});return {data:{},error:null};}})})},
  'node:crypto':require('node:crypto'),'zod':z,'@/lib/boat-restore-validation':{},'@/lib/boat-push':{flushBoatPush:async()=>{}}};
 const source=fs.readFileSync(path.join(root,'app/api/boat-ops/[operation]/route.ts'),'utf8');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:api,require:n=>modules[n],process:{env:{BOAT_CONTROL_SERVER_SECRET:'fixture'}},URL,AbortSignal,Buffer});
 const boat='1'.repeat(32),id=crypto.randomUUID(),key=crypto.randomUUID();
 const call=(op,body,login=true)=>api[body?'POST':'GET']({method:body?'POST':'GET',nextUrl:new URL('https://a.test/?boat='+boat+'&id='+id),
  cookies:{get:()=>login?{value:'test-session'}:undefined},headers:{get:n=>n==='content-type'?'application/json':null},text:async()=>JSON.stringify(body)}, {params:{operation:op}});
 assert.equal((await call('guest_plan',null,false)).status,401);assert.equal(seen.length,0);
 assert.equal((await call('guest_plan',null)).status,200);assert.equal(seen.at(-1).rpc,'boat_guest_plan_rpc');
 assert.equal(seen.at(-1).args.payload.id,id);
 const save={id,key,boat,revision:0,version:0,changes:{onboardNotes:'Observación'}};
 assert.equal((await call('guest_plan_save',save)).status,200);const count=seen.length;
 for(const invalid of [{captainCollection:'collect'}, {name:'Otro nombre'},{}])assert.equal((await call('guest_plan_save',{...save,changes:invalid})).status,400);
 assert.equal(seen.length,count);
 const details=Object.fromEntries(['embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests','country','airConditioning'].map(k=>[k,k]));
 assert.equal((await call('brief_save',{boat,id,key,revision:0,details})).status,200);
 assert.deepEqual(Object.keys(seen.at(-1).args.payload.details).sort(),Object.keys(details).sort());
});
