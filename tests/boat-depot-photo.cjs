const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {randomUUID,createHash}=require('node:crypto');
const read=p=>readFileSync(p,'utf8');
function moduleFrom(p,required,env={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(read(p),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:required,Intl,Date,process:{env},URL,Buffer,AbortSignal});
 return exports;
}
const parser=moduleFrom('lib/boat-intake.ts',require);
test('photo OCR rows accept simple counts and leave unreadable quantities untouched',()=>{
 const names=text=>JSON.parse(JSON.stringify(parser.readIntakeList(text,{simpleCount:true}).data.items)).map(x=>[x.name,x.quantity,x.unit]);
 assert.deepEqual(names('Arroz 7\nLeche: 3 L\nCafé ?\nLatas = 0'),[['Arroz',7,''],['Leche',3,'L'],['Café ?',null,''],['Latas',0,'']]);
 assert.equal(parser.readIntakeList('Arroz 7').data.items[0].quantity,null);
});
test('review preserves known catalog metadata, blocks uncertainty and never assumes an unreadable zero',()=>{
 const ctx={HTMLElement:class {},customElements:{define(){}}};
 vm.createContext(ctx); vm.runInContext(read('public/a-bordo/depot-photo.js'),ctx);
 const stocked={id:'a',name:'Arroz',unit:'kg',location:'Alacena',area:'gastronomia',current:9};
 const rows=[{name:'arroz',quantity:7},{name:'Huevos',quantity:0},{name:'Café',quantity:null}];
 const out=ctx.depotPhotoItems(rows,[stocked],'gastronomia',true);
 assert.equal(out[0].productId,'a');assert.equal(out[0].unit,'kg');assert.equal(out[0].location,'Alacena');
 assert.equal(out[1].unit,'unidad');assert.equal(out[1].quantity,0);assert.equal(out[2].reason,'Cantidad o producto ilegible');
 assert.equal(ctx.depotPhotoItems(rows,[stocked,{...stocked,id:'b',location:'Seco'}],'gastronomia',true)[0].reason,'Elegí el artículo correcto');
});
test('read auto-extracts without a write; confirmed depot batches require authorization and previews cannot write',async()=>{
 const hits=[];
 const make=(env={})=>moduleFrom('app/api/boat-ops/[operation]/route.ts',
 name=>({'next/server':{NextResponse:{json:(data,opts)=>({data,status:opts.status})}},'zod':require('zod'),'node:crypto':require('node:crypto'),
 '@/lib/boat-intake':parser,'@/lib/boat-restore-validation':{},'@/lib/boat-push':{},
 '@supabase/supabase-js':{createClient:()=>({rpc:(name,args)=>({abortSignal:async()=>{
   hits.push([name,args]);return args.payload.session===createHash('sha256').update('crew').digest('hex')?{error:{code:'42501',message:'Reserved'}}:{data:{ok:true}};
 }})})}})[name],{BOAT_CONTROL_SERVER_SECRET:'isolated-fixture',...env});
 const call=(route,op,body,token='admin')=>route.POST({method:'POST',nextUrl:new URL('https://fixture.test'),headers:{get:k=>k==='content-type'?'application/json':null},text:async()=>JSON.stringify(body),cookies:{get:()=>token?{value:token}:undefined}}, {params:{operation:op}});
 const normal=make(),op='warehouse_photo_count',data={scope:'depot',key:randomUUID(),confirmed:true,revision:0,items:[{name:'Arroz',quantity:7,unit:'kg',location:'Tierra',area:'gastronomia'}]};
 const preview=await call(normal,'warehouse_photo_read',{scope:'depot',text:'Arroz 7'});
 assert.equal(preview.data.items[0].quantity,7);assert.equal(hits[0][1].operation,'warehouse_dashboard');
 assert.equal((await call(normal,'warehouse_photo_read',{scope:'depot',text:'Arroz 7'},'crew')).status,403);
 assert.equal((await call(normal,op,data,'')).status,401);
 assert.equal((await call(normal,op,{...data,confirmed:false})).status,400);
 assert.equal((await call(normal,op,{...data,scope:'boat'})).status,400);
 assert.equal((await call(make({VERCEL_ENV:'preview'}),op,data)).status,403);
 assert.equal((await call(normal,op,data)).status,200);
 assert.equal(hits.length,3);assert.equal(hits.at(-1)[0],'boat_stockroom_photo_count_rpc');
});
const hasPGlite=(()=>{try{return !!require.resolve('@electric-sql/pglite');}catch{return false;}})();
test('isolated Postgres: reject crew, duplicate and stale counts; preserve stock and cost; replay safely',{skip:!hasPGlite&&'Install @electric-sql/pglite for the isolated SQL test'},async()=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema boat_control; create schema extensions;
  create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1),'hex')$$;
  create table boat_control.config(secret_hash text); insert into boat_control.config values(encode(extensions.digest('fixture','sha256'),'hex'));
  create table boat_control.accounts(id text primary key,name text,admin boolean);
  create table boat_control.sessions(user_id text,token text,expires timestamptz);
  insert into boat_control.accounts values ('a','Admin QA',true),('c','Crew QA',false);
  insert into boat_control.sessions values ('a','admin',now()+interval '1 day'),('c','crew',now()+interval '1 day');
  create table boat_control.stockroom(id boolean primary key,name text,products jsonb,movements jsonb,revision int);
  insert into boat_control.stockroom values(true,'Tierra','[{"id":"arroz","name":"Arroz","unit":"kg","location":"Seco","area":"gastronomia","current":9,"lastInvoiceUnitCost":3},{"id":"otro","name":"Otros","current":11}]','[]',0);
  create table boat_control.operation_receipts(user_id text,key uuid,request jsonb,result jsonb,created_at timestamptz,primary key(user_id,key));
  `);
  const base=read('supabase/migrations/20261124202124_boat_admin_stockroom.sql');
  await db.exec(base.slice(base.indexOf('create function boat_control.stockroom_match('),base.indexOf('create function boat_control.stockroom_price(')));
  await db.exec(read('supabase/migrations/20261126203000_stockroom_photo_count.sql'));
  const batch={session:'admin',key:randomUUID(),scope:'depot',confirmed:true,revision:0,items:[
   {name:'Arroz',quantity:7,unit:'kg',location:'Seco',area:'gastronomia',productId:'arroz'},
   {name:'Huevos',quantity:0,unit:'unidad',location:'Frío',area:'gastronomia'}
  ]};
  const run=(b,secret='fixture')=>db.query('select public.boat_stockroom_photo_count_rpc($1,$2::jsonb) as result',[secret,JSON.stringify(b)]).then(r=>r.rows[0].result);
  const snap=()=>db.query('select * from boat_control.stockroom').then(r=>r.rows[0]);
  await assert.rejects(run({...batch,session:'crew'}),/administración/);
  await assert.rejects(run(batch,'alt'),/no autorizado/);
  await assert.rejects(run({...batch,items:[batch.items[0],{...batch.items[0],quantity:8}]}),/dos veces/);
  await assert.rejects(run({...batch,items:[batch.items[0],{...batch.items[1],quantity:null}]}),/cantidad/);
  assert.equal((await snap()).revision,0);
  assert.deepEqual(await run(batch),{ok:true,rows:2,revision:1});
  assert.deepEqual(await run(batch),{ok:true,rows:2,revision:1});
  await assert.rejects(run({...batch,key:randomUUID()}),/Cambió el inventario/);
  await assert.rejects(run({...batch,items:[batch.items[0]]}),/reutilizado/);
  const result=await snap();
  assert.deepEqual(result.products.map(x=>[x.name,x.current,x.lastInvoiceUnitCost]),[['Arroz',7,3],['Otros',11,undefined],['Huevos',0,undefined]]);
  assert.deepEqual(result.movements.map(m=>[m.batchId,m.delta]),[[batch.key,-2],[batch.key,0]]);
 }finally{await db.close();}
});
