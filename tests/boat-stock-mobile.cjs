/* Mobile stock regression. All browser requests are intercepted by the local fixture. */
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(process.env.STOCK_BASE || '.'),overlay=process.env.STOCK_OVERLAY&&path.resolve(process.env.STOCK_OVERLAY);
const sourceDir='public/a-bordo', A='a'.repeat(32), B='b'.repeat(32);
const item=(id,name,current,location='Pañol')=>({id,name,current,location,min:2,unit:'un',category:'Repuestos',area:'tecnica',system:'Cubierta',cost:1});
const empty=(name,products)=>({schema:1,boat:{name,model:'',currency:'USD',equipment:[]},products,logs:[],purchases:[],movements:[],tasks:[],cameras:[],manual:{content:'',updatedAt:'',updatedBy:''}});
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_BIN?{executablePath:process.env.CHROMIUM_BIN}:{}),args:['--disable-background-networking']});
 const errors=[];const runCase=async(name,test)=>{if(process.env.STOCK_CASE&&!name.includes(process.env.STOCK_CASE))return;try{await test();console.log('PASS '+name)}catch(e){errors.push(name);console.error('FAIL '+name+' '+e.message.split('\n').slice(0,18).join(' '));}};
 const boats={[A]:empty('Barco A',[item('filtro','Filtro',7)]),[B]:empty('Barco B',[item('cabo','Cabo',3)])},requests={[A]:[],[B]:[]},docs={[A]:[],[B]:[]},rev={[A]:1,[B]:1},applied=new Set();
 let admin=true,role='encargado',lost=false,refuseB=false,changes=[],outbound=0,ctx,page;
 async function login(userRole){
  if(ctx)await ctx.close();admin=userRole==='admin';role=admin?'encargado':userRole;
  ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});page=await ctx.newPage();page.setDefaultTimeout(9000);
  await ctx.route('**/*',async r=>{
   const req=r.request(),u=new URL(req.url()),pp=u.pathname,op=pp.split('/').pop(),m=req.method(),data=m==='POST'||m==='PUT'?req.postDataJSON():{},boat=data.boat||u.searchParams.get('boat')||A;
   const json=(v,status=200)=>r.fulfill({json:v,status});
   if(u.hostname!=='localhost'){outbound++;return r.abort()}
   if(pp.startsWith('/api/boat/')){
    if(op==='session')return json({user:{id:'user-'+userRole,name:'Prueba '+userRole,admin},setup:false});
    if(op==='boats')return json(Object.entries(boats).map(([id,s])=>({id,name:s.boat.name,role})));
    if(op==='state'){if(boat===B&&refuseB)return json({error:'Barco B sin conexión'},503);if(m==='PUT'){assert.equal(data.revision,rev[boat]);boats[boat]=data.state;rev[boat]++;}return json({state:boats[boat],revision:rev[boat],role})}
    if(op==='activity')return json([]);return json({});
   }
   if(pp.startsWith('/api/boat-ops/')){
    if(op==='overview')return json({requests:requests[boat],fleet:[],transfers:[],notifications:[],reservations:[]});
    if(op==='reservations')return json([]);
    if(m!=='POST')return json([]);
    const key=boat+':'+data.key;changes.push({op,boat,key,quantity:data.quantity});if(applied.has(key))return json({ok:true,alreadyApplied:true});
    const products=boats[boat].products,p=products.find(x=>x.id===data.productId);
    if(op==='request_create')requests[boat].push({...data,id:'req'+requests[boat].length,status:'borrador',received:0,created_by:'user-'+userRole});
    if(op==='request_status')requests[boat].find(q=>q.id===data.id).status=data.status;
    if(op==='request_receive'){const q=requests[boat].find(q=>q.id===data.id);q.received+=data.quantity;if(q.received===q.quantity)q.status='recibido';p.current+=data.quantity;}
    if(op==='stock_consume'){assert.ok(p.current>=data.quantity);p.current-=data.quantity;}
    if(op==='stock_add')products.push({...item('new'+products.length,data.name,data.quantity,data.location),unit:data.unit,area:data.area});
    applied.add(key);rev[boat]++;if(lost&&op==='stock_consume'){lost=false;return r.abort('connectionfailed')}return json({ok:true});
   }
   if(pp.startsWith('/api/boat-intake/')){
    if(op==='list')return json(docs[boat]);
    if(op==='scan')return json({data:{date:'2026-11-21',supplier:'',reference:'',currency:'',total:null,notes:'',items:[{productId:'filtro',name:'Filtro',unit:'un',quantity:2,location:'Pañol',area:'tecnica',unitCost:null}]}});
    const key=boat+':'+data.key;if(applied.has(key))return json({status:'applied',alreadyApplied:true});
    if(op==='submit'){docs[boat].push({id:'doc'+docs[boat].length,status:'pending',author:'Admin',created_at:'2026-11-21',kind:data.kind,data:data.data,source:data.source});}
    if(op==='ticket_confirm'||op==='apply'){
     for(const [i,x] of data.data.items.entries()){let p=boats[boat].products.find(y=>x.productId?y.id===x.productId:y.name===x.name&&y.location===x.location);if(!p){p=item('importado'+boats[boat].products.length,x.name,0,x.location);boats[boat].products.push(p);}p.current=op==='ticket_confirm'?p.current+x.quantity:x.quantity;}
     if(op==='apply')docs[boat].find(d=>d.id===data.id).status='applied';rev[boat]++;
    }
    changes.push({op,boat});applied.add(key);return json({status:op==='submit'?'pending':'applied'});
   }
   if(pp.startsWith('/a-bordo/')){const name=pp.slice(9)||'index.html';const specific=name==='intake.js'&&process.env.STOCK_INTAKE;const candidates=[specific,overlay&&path.join(overlay,sourceDir,name),path.join(root,sourceDir,name)].filter(Boolean);const f=candidates.find(p=>fs.existsSync(p));if(f&&fs.statSync(f).isFile())return r.fulfill({path:f,contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream'})}
   return json({});
  });
  await page.goto('http://localhost:32184/a-bordo/');await page.locator('#opsBoat').waitFor();
 }
 const tap=(sel)=>page.locator(sel).first().tap();
 async function stock(){await tap('[data-day="ops-stock"]');await page.getByRole('heading',{name:'Stock y pedidos',exact:true}).waitFor()}
 async function submit(form){await form.locator('[type=submit]').tap()}
 const receipt=()=>page.locator('form[data-operation=request_receive]');
 async function fill(form,values){for(const [name,value] of Object.entries(values))await form.locator('[name='+name+']').fill(String(value))}
 async function detail(label){await page.getByText(label,{exact:true}).first().tap()}
 async function consumeForm(){const box=page.locator('article.day-inventory').filter({has:page.getByRole('heading',{name:'Filtro',exact:true})});await box.getByText('Registrar consumo',{exact:true}).tap();return box.locator('[data-operation=stock_consume]')}
 async function waitFor(fn){for(let i=0;i<90;i++){if(fn())return;await new Promise(r=>setTimeout(r,75))}assert.ok(fn())}
 try{
 await runCase('lector consulta, sin controles de escritura',async()=>{await login('lector');await stock();assert.equal(await page.locator('[data-op=request_product],[data-operation=stock_consume],[data-intake=ticket]').count(),0);await tap('[data-day=ops-requests]');await page.getByRole('heading',{name:'Pedidos y faltantes'}).waitFor();assert.equal(await page.locator('[data-operation=request_create]').count(),0);});
 await runCase('tripulante solicita reposición y conserva la cantidad',async()=>{await login('chef');await stock();assert.equal(await page.locator('[data-intake=ticket],[data-operation=stock_add]').count(),0);await tap('[data-op=request_product]');const f=page.locator('[data-operation=request_create]');assert.equal(await f.locator('[name=name]').inputValue(),'Filtro');await fill(f,{quantity:4});await submit(f);await tap('[data-op=request_status][data-status=solicitado]');await page.getByText(/4 un · solicitado/).waitFor();assert.equal(boats[A].products[0].current,7);assert.equal(await receipt().count(),0);});
 await runCase('compra, recepción parcial y recepción final',async()=>{await login('admin');await tap('[data-day=ops-requests]');await tap('[data-op=request_status][data-status=aprobado]');await tap('[data-op=request_status][data-status=comprado]');await detail('Recibir mercadería');await fill(receipt(),{quantity:1,location:'Pañol'});await receipt().locator('[name=productId]').selectOption('filtro');await submit(receipt());await page.getByText('Recibido: 1 · Pendiente: 3').waitFor();assert.equal(boats[A].products[0].current,8);await detail('Recibir mercadería');await fill(receipt(),{quantity:3,location:'Pañol'});await receipt().locator('[name=productId]').selectOption('filtro');await submit(receipt());await page.getByText('Recibido: 4 · Pendiente: 0').waitFor();assert.equal(boats[A].products[0].current,11);});
 await runCase('desconexión después de consumo, recuperación tras recarga sin duplicar',async()=>{await login('chef');await stock();let f=await consumeForm();await fill(f,{quantity:2,note:'Salida de prueba'});lost=true;await submit(f);await f.getByText(/No se pudo confirmar/).waitFor();assert.ok(await f.locator('[name=quantity]').isDisabled());assert.equal(boats[A].products[0].current,9);await page.reload();await stock();f=await consumeForm();await f.getByText('Verificar guardado pendiente',{exact:true}).waitFor();assert.equal(await f.locator('[name=quantity]').inputValue(),'2');assert.ok(await f.locator('[name=quantity]').isDisabled());await submit(f);await waitFor(()=>changes.filter(c=>c.op==='stock_consume').length===2);const attempts=changes.filter(c=>c.op==='stock_consume');assert.equal(attempts[0].key,attempts[1].key);assert.equal(boats[A].products[0].current,9);await page.getByText('9 un',{exact:true}).first().waitFor();});
 await runCase('selector de barco recupera fallo y conserva el barco visible',async()=>{await login('admin');await stock();refuseB=true;await page.locator('#opsBoat').selectOption(B);await page.getByText('Barco B sin conexión',{exact:true}).waitFor();assert.equal(await page.locator('#opsBoat').inputValue(),A);await page.getByRole('heading',{name:'Filtro'}).waitFor();refuseB=false;await page.locator('#opsBoat').selectOption(B);await page.getByRole('heading',{name:'Cabo',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Filtro'}).count(),0);assert.equal(await page.locator('#opsBoat').inputValue(),B);});
 await runCase('conteo inicial cero y ticket recibido',async()=>{await login('admin');await stock();await detail('＋ Cargar cantidad contada');const f=page.locator('form[data-operation=stock_add]');await fill(f,{name:'Precinto',unit:'un',quantity:0,location:'Taller'});await submit(f);await page.getByRole('heading',{name:'Precinto'}).waitFor();assert.equal(boats[A].products.find(x=>x.name==='Precinto').current,0);await tap('[data-intake=ticket]');await page.locator('#intakeInput [name=text]').fill('Filtro;2;un;Pañol');await submit(page.locator('#intakeInput'));const form=page.locator('#intakeReview');await fill(form,{supplier:'Proveedor de prueba',total:12});await form.locator('[name=currency]').selectOption('USD');await form.locator('[name=confirmed]').check();await submit(form);await waitFor(()=>changes.some(c=>c.op==='ticket_confirm'));assert.equal(boats[A].products[0].current,11);});
 await runCase('lista anterior de dos filas revisada y confirmada, ambas sobreviven',async()=>{await login('admin');await stock();await detail('Recuperar inventario gastronómico anterior');await page.locator('#legacyInventory').setInputFiles({name:'respaldo.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({products:[{name:'Agua',unit:'L',current:5,location:'Cocina'},{name:'Arroz',unit:'kg',current:0,location:'Cocina'}]}))});await page.getByRole('button',{name:'Revisar conteo'}).tap();const form=page.locator('#intakeReview');await form.waitFor();assert.equal(await form.locator('[data-intake-row]').count(),2);assert.equal(await form.locator('[name=quantity]').nth(1).inputValue(),'0');await form.locator('[name=date]').fill('2026-11-21');await form.locator('[name=confirmed]').check();await submit(form);await page.getByRole('button',{name:'Ver y revisar'}).tap();await form.locator('[name=confirmed]').check();await submit(form);await waitFor(()=>docs[A].some(d=>d.status==='applied'));assert.equal(boats[A].products.find(p=>p.name==='Agua').current,5);assert.equal(boats[A].products.find(p=>p.name==='Arroz').current,0);});
 await runCase('segunda pestaña conserva el consumo incierto original',async()=>{
  await login('chef');await stock();const first=await consumeForm();await fill(first,{quantity:1,note:'Consumo primero'});
  const primary=page,second=await ctx.newPage();page=second;
  await second.goto('http://localhost:32184/a-bordo/');await stock();const other=await consumeForm();await fill(other,{quantity:3,note:'Otra operación'});
  const starting=boats[A].products[0].current,count=changes.filter(c=>c.op==='stock_consume').length;
  await primary.bringToFront();lost=true;await submit(first);await first.getByText(/No se pudo confirmar/).waitFor();
  await second.bringToFront();await submit(other);await other.getByText('Verificar guardado pendiente',{exact:true}).waitFor();
  assert.equal(await other.locator('[name=quantity]').inputValue(),'1');assert.equal(changes.filter(c=>c.op==='stock_consume').length,count+1);
  await submit(other);await waitFor(()=>changes.filter(c=>c.op==='stock_consume').length===count+2);
  assert.equal(boats[A].products[0].current,starting-1);assert.equal(changes.at(-1).key,changes.at(-2).key);await second.close();page=primary;
 });
 assert.equal(outbound,0);
 }finally{await browser.close()}
 assert.deepEqual(errors,[]);
}
run().catch(e=>{console.error(e.message);process.exitCode=1});

