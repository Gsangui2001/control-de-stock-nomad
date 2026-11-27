import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),migration=path=>fs.readFileSync(new URL('../supabase/migrations/'+path,import.meta.url),'utf8');
let available=true;try{require.resolve('@electric-sql/pglite');}catch{available=false;}
test('whole-package receipt conserves source kg and credits exact configured portions',{skip:!available&&'Install @electric-sql/pglite for isolated SQL QA'},async()=>{
const {PGlite}=require('@electric-sql/pglite');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
const db=new PGlite({extensions:{pgcrypto}});try{
await db.exec(`
create schema boat_control; create schema extensions; create extension pgcrypto schema extensions;
create role anon; create role authenticated;
create table boat_control.config(secret_hash text);
create table boat_control.accounts(id text primary key,name text,admin boolean not null);
create table boat_control.sessions(user_id text,token text,expires timestamptz);
create table boat_control.members(user_id text,boat_id text,role text);
create table boat_control.boats(id text primary key,name text,state jsonb,revision integer);
create table boat_control.photos(id uuid primary key,boat_id text);
create table boat_control.operation_receipts(user_id text,key uuid,request jsonb,result jsonb,created_at timestamptz,primary key(user_id,key));
create table boat_control.audit(boat_id text,user_id text,revision integer);
create table boat_control.events(id bigserial primary key,boat_id text,actor_id text,kind text,detail jsonb);
create table boat_control.notifications(id bigserial primary key,event_id bigint,user_id text);
create table boat_control.push_subscriptions(id bigint,user_id text,active boolean);
create table boat_control.push_jobs(notification_id bigint,subscription_id bigint);
create table boat_control.stockroom(id boolean primary key,name text,products jsonb,movements jsonb,revision integer);
insert into boat_control.config values(encode(extensions.digest('fixture-secret','sha256'),'hex'));
insert into boat_control.accounts values ('chef','Chef',false),('read','Lector',false),('admin','Admin',true);
insert into boat_control.sessions values('chef','chef-token',now()+interval '1 hour'),('read','read-token',now()+interval '1 hour'),('admin','admin-token',now()+interval '1 hour');
insert into boat_control.members values ('chef','nomad','chef'),('read','nomad','lector');
insert into boat_control.boats values ('nomad','Nomadé','{"products":[],"movements":[]}',0),('pink','Pink','{"products":[],"movements":[]}',0);
insert into boat_control.stockroom values(true,'Tierra','[{"id":"meat","name":"Carne","unit":"kg","area":"gastronomia","current":25},{"id":"soda","name":"Coca original","unit":"latas","area":"gastronomia","current":144}]','[]',0);
`);
const expand=migration('20261124202124_boat_admin_stockroom.sql');
await db.exec(expand.slice(expand.indexOf('create function boat_control.stockroom_match'),expand.indexOf('create function boat_control.stockroom_price')));
const ops=migration('20261023145110_boat_operations.sql');
const start=ops.indexOf('create function boat_control.stock_delta');
await db.exec(ops.slice(start,ops.indexOf('end $$;',start)+'end $$;'.length));
const base=migration('20261126204807_stockroom_packages.sql');
await db.exec(base.slice(0,base.indexOf('-- Carry depot receipts')));
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(let n=1;n<=15;n++) await db.query('insert into boat_control.photos values ($1,$2)',[uuid(n),n===15?'pink':'nomad']);
const call=async(op,p)=>(await db.query('select public.boat_stockroom_package_rpc($1,$2,$3::jsonb) as r',['fixture-secret','warehouse_package_'+op,JSON.stringify(p)])).rows[0].r;
const send=(payload={})=>({boat:'nomad',key:uuid(100),session:'admin-token',photo:uuid(1),revision:0,items:[{productId:'meat',packs:1,perPack:10,portionGrams:400},{productId:'soda',packs:1,perPack:24}],...payload});
const receive=(id,payload={})=>({boat:'nomad',key:uuid(101),session:'chef-token',photo:uuid(2),signature:uuid(3),verified:true,id,...payload});
const depot=async()=>(await db.query('select * from boat_control.stockroom')).rows[0];
const boat=async()=>(await db.query("select state,revision from boat_control.boats where id='nomad'")).rows[0];
const both=async()=>[await depot(),await boat()];
const oldSending=await call('send',send({key:uuid(199),photo:uuid(14),items:[{productId:'soda',packs:1,perPack:12}]}));
assert.equal(oldSending.status,'in_transit'); // old in-flight shipment in real production shape.
await db.exec(migration('20261127174723_boat_warehouse_portions.sql'));
const before=await both();
for(const it of [
 [{productId:'meat',packs:1,perPack:10,portionGrams:350}],
 [{productId:'soda',packs:1,perPack:24,portionGrams:400}],
 [{productId:'meat',packs:1,perPack:10,portionGrams:400.5}],
 [{productId:'meat',packs:1,perPack:10,portionGrams:null}],
 [{productId:'meat',packs:1,perPack:10,portionGrams:'400'}],
 [{productId:'meat',packs:1,perPack:10,portionGrams:0}]
]) await assert.rejects(call('send',send({revision:1,items:it})));
assert.deepEqual(await both(),before);
const sending=await call('send',send({revision:1}));
assert.equal(sending.status,'in_transit');
assert.deepEqual(await call('send',send({revision:1})),sending);
const afterSend=await depot();
assert.equal(afterSend.products.find(p=>p.id==='meat').current,15);
assert.equal(afterSend.products.find(p=>p.id==='soda').current,108);
assert.equal(afterSend.movements.find(m=>m.productId==='meat').delta,-10);
assert.equal(afterSend.movements.find(m=>m.productId==='meat').unit,'kg');
assert.equal((await boat()).state.products.length,0);
const [inflight]=(await call('list',{boat:'nomad',session:'chef-token'})).filter(s=>s.id===sending.id);
assert.equal(inflight.items[0].portions,25);
assert.equal(inflight.items[0].portionGrams,400);
assert.equal(inflight.items[0].destinationName,'Carne · 400 g por porción');
assert.ok(!('portionGrams' in inflight.items[1]));
for(const change of [{signature:uuid(15)},{signature:uuid(2)},{session:'read-token'},{verified:false},{items:[]}])await assert.rejects(call('receive',receive(sending.id,change)));
assert.equal((await boat()).state.products.length,0);
const issue=await call('issue',{boat:'nomad',key:uuid(110),session:'chef-token',photo:uuid(4),note:'Foto posible diferencia',id:sending.id});
assert.equal(issue.status,'review');assert.equal((await boat()).state.products.length,0);
const receipt=await call('receive',receive(sending.id));
assert.equal(receipt.status,'received');assert.deepEqual(await call('receive',receive(sending.id)),receipt);
await assert.rejects(call('receive',receive(sending.id,{key:uuid(105)})));
let output=await boat();
assert.deepEqual(output.state.products.map(p=>[p.name,p.current,p.unit]),[['Carne · 400 g por porción',25,'porciones'],['Coca original',24,'latas']]);
assert.equal(output.state.movements.length,2);
const confirmed=(await call('list',{boat:'nomad',session:'chef-token'})).find(s=>s.id===sending.id);
assert.equal(confirmed.items[0].received,10);assert.equal(confirmed.items[0].receivedPortions,25);
assert.equal(confirmed.receipts.length,2);
const signed=confirmed.receipts.find(r=>r.verified);
assert.equal(signed.items[0].sourceQty,10);assert.equal(signed.items[0].quantity,25);
await call('receive',receive(oldSending.id,{key:uuid(111),photo:uuid(6),signature:uuid(7)}));
const newPack=await call('send',send({key:uuid(115),revision:2,photo:uuid(8),items:[{productId:'meat',packs:1,perPack:10,portionGrams:500}]}));
await call('receive',receive(newPack.id,{key:uuid(116),photo:uuid(9),signature:uuid(10)}));
output=await boat();
assert.deepEqual(output.state.products.map(p=>[p.name,p.current,p.unit]),[['Carne · 400 g por porción',25,'porciones'],['Coca original',36,'latas'],['Carne · 500 g por porción',20,'porciones']]);
assert.equal((await depot()).products.find(p=>p.id==='meat').current,5);
console.log('Portions: exact kg conservation, mixed package, prior pending compatibility, evidence/signature, variants, once-only receipt, bad weights reject.');
}finally{await db.close();}
});
