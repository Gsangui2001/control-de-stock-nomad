// Read-only live verification using short-lived QA sessions. Never publishes a
// customer's draft. Cookie values stay in an ignored local file.
const fs=require('fs'),assert=require('node:assert/strict');
const sessions=JSON.parse(fs.readFileSync('.work/brief-readback-sessions.json','utf8'));
const base=process.env.BOAT_BRIEFS_URL||'http://localhost:5198',boat='6bf8e2dceb8157d62159ae7bd29967fd';
async function call(op,role='admin',data,boatId=boat){
 const response=await fetch(base+'/api/boat-ops/'+op+(data?'':'?boat='+boatId),{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(sessions[role]?{Cookie:'boat_session='+sessions[role]}:{})},body:data?JSON.stringify({...data,boat:boatId}):undefined});
 const result=await response.json();return {status:response.status,result};
}
(async()=>{
 assert.equal((await call('reservations','none')).status,401);
 const admin=await call('reservations');assert.equal(admin.status,200,JSON.stringify(admin.result));assert.ok(admin.result.length>0);
 assert.ok(admin.result.every(r=>r.brief&&Number.isInteger(r.brief.revision)&&r.brief.sourceHash));
 const id=admin.result[0].id;
 for(const role of ['capitan','chef','marinero']){
  const result=await call('reservations',role);assert.equal(result.status,200);assert.ok(result.result.every(r=>r.brief.version>0&&!r.brief.draft&&!('crmBalance' in r)));
  assert.equal((await call('external_templates',role)).status,403);
  assert.equal((await call('brief_publish',role,{key:crypto.randomUUID(),id,revision:0,sourceHash:'a'.repeat(64)})).status,403);
  assert.equal((await call('reservations',role,undefined,'00000000000000000000000000000000')).status,403);
 }
 const templates=await call('external_templates');assert.equal(templates.status,200);assert.ok(templates.result.every(r=>!admin.result.some(n=>n.id===r.id)));
 assert.equal((await call('brief_review','chef',{key:crypto.randomUUID(),id,version:0})).status,400);
 console.log(JSON.stringify({passed:true,base,adminDrafts:admin.result.length,externalTemplates:templates.result.length,checks:'session, role isolation, publication authorization, schema, templates; no customer writes'}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
