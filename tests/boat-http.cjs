const fs=require('fs'),assert=require('node:assert/strict');
const qa=JSON.parse(fs.readFileSync('.work/qa-credentials.json','utf8'));
const base=process.env.BOAT_QA_URL||'http://localhost:5194';
const access=process.env.BOAT_QA_ACCESS?JSON.parse(fs.readFileSync(process.env.BOAT_QA_ACCESS,'utf8')):[];
const accessCookie=access.filter(c=>new URL(base).hostname===c.domain.replace(/^\./,'')).map(c=>c.name.trim()+'='+c.value.trim()).join('; ');
const cookies={};
async function call(path,{method='GET',data,role='admin'}={}){
 const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:[accessCookie,cookies[role]].filter(Boolean).join('; ')},body:data?JSON.stringify(data):undefined});
 const result=await response.json();return {status:response.status,result,cookie:response.headers.get('set-cookie')};
}
async function op(operation,data={},role='admin',boat=qa.boat){return call('/api/boat-ops/'+operation,{method:'POST',data:{boat,key:crypto.randomUUID(),...data},role});}
(async()=>{
 for(const role of ['admin','chef','captain','reader']){
  const r=await call('/api/boat/login',{method:'POST',data:{username:qa.prefix+'-'+role,password:qa.password}});assert.equal(r.status,200,JSON.stringify(r.result));cookies[role]=r.cookie.split(';')[0];
 }
 const host=new URL(base).hostname;
 fs.writeFileSync('.work/qa-browser-state.json',JSON.stringify({cookies:[{name:'boat_session',value:cookies.admin.split('=')[1],domain:host,path:'/',expires:-1,httpOnly:true,secure:base.startsWith('https:'),sameSite:'Strict'}],origins:[]}));
 let r=await call('/api/boat-ops/overview?boat='+qa.otherBoat,{role:'chef'});assert.equal(r.status,403);
 const key=crypto.randomUUID();
 r=await op('stock_add',{key,area:'gastronomia',name:'Arroz prueba HTTP',unit:'kg',quantity:10,location:'Alacena',note:'QA'});assert.equal(r.status,200,JSON.stringify(r.result));const product=r.result;
 assert.equal((await op('stock_add',{key,area:'gastronomia',name:'Arroz prueba HTTP',unit:'kg',quantity:10,location:'Alacena',note:'QA'})).result.id,product.id);
 assert.equal((await op('stock_add',{area:'gastronomia',name:'No autorizado',unit:'kg',quantity:1,location:'Alacena',note:'QA'},'chef')).status,403);
 assert.equal((await op('stock_consume',{productId:product.id,quantity:11,note:'QA consumo'},'chef')).status,400);
 assert.equal((await op('stock_consume',{productId:product.id,quantity:1,note:'QA consumo'},'chef')).status,200);
 r=await op('request_create',{area:'gastronomia',name:'Arroz pedido HTTP',unit:'kg',quantity:4,urgent:false,notes:'QA',photo:''},'chef');assert.equal(r.status,200,JSON.stringify(r.result));const id=r.result.id;
 assert.equal((await op('request_status',{id,status:'solicitado'},'chef')).status,200);
 assert.equal((await op('request_status',{id,status:'aprobado'},'chef')).status,403);
 assert.equal((await op('request_status',{id,status:'aprobado'})).status,200);
 assert.equal((await op('request_status',{id,status:'comprado'})).status,200);
 assert.equal((await op('request_receive',{id,quantity:2,productId:product.id,location:'Alacena'},'captain')).status,200);
 r=await op('transfer_send',{productId:product.id,target:qa.otherBoat,quantity:2});assert.equal(r.status,200,JSON.stringify(r.result));
 r=await call('/api/boat-ops/overview?boat='+qa.otherBoat);const transfer=r.result.transfers[0];
 const transferKey=crypto.randomUUID();assert.equal((await op('transfer_receive',{key:transferKey,id:transfer.id,quantity:2,location:'Alacena destino'},'admin',qa.otherBoat)).status,200);
 assert.equal((await op('transfer_receive',{key:transferKey,id:transfer.id,quantity:2,location:'Alacena destino'},'admin',qa.otherBoat)).status,200);
 r=await call('/api/boat/state?boat='+qa.boat);let state=r.result.state,revision=r.result.revision;
 state.boat.equipment=[{id:crypto.randomUUID(),name:'Motor babor QA',system:'Motor babor',hours:100}];
 state.tasks=[{id:crypto.randomUUID(),title:'Inspección de motor QA',system:'Motor babor',equipmentId:state.boat.equipment[0].id,assignedRole:'capitan',assignee:'',nextDate:'2026-10-23',nextHours:'',intervalDays:7,intervalHours:0,done:false,description:'Verificar sin modificar existencias.'}];
 const saveKey=crypto.randomUUID();const body={boat:qa.boat,key:saveKey,state,revision};
 r=await call('/api/boat/state?boat='+qa.boat,{method:'PUT',data:body});assert.equal(r.status,200,JSON.stringify(r.result));
 const newRevision=r.result.revision;
 r=await call('/api/boat/state?boat='+qa.boat,{method:'PUT',data:body});assert.equal(r.status,200,JSON.stringify(r.result));assert.equal(r.result.revision,newRevision,'lost-response replay');
 r=await call('/api/boat/state?boat='+qa.boat,{method:'PUT',data:{...body,key:crypto.randomUUID()}});assert.equal(r.status,409);
 r=await call('/api/boat/state?boat='+qa.boat,{role:'chef'});state=r.result.state;revision=r.result.revision;assert.equal(state.tasks.length,0,'captain task hidden');
 state.products[0].current=999;
 r=await call('/api/boat/state?boat='+qa.boat,{method:'PUT',role:'chef',data:{state,revision,boat:qa.boat,key:crypto.randomUUID()}});assert.equal(r.status,403,'stock tampering blocked');
 assert.equal((await op('push_subscribe',{subscription:{endpoint:'https://127.0.0.1/private',keys:{auth:'aaaaaaaaaaaaaaaa',p256dh:'aaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}})).status,400,'SSRF endpoint rejected');
 assert.equal((await call('/api/boat-push')).status,401,'worker protected');
 console.log('PASS HTTP: four roles, cross-boat isolation, request lifecycle, partial receipt, transfers, duplicate retries, stock protection, state replay/conflict and push protection.');
 fs.writeFileSync('output/boat-http-result.json',JSON.stringify({base,passed:true,at:new Date().toISOString()},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
