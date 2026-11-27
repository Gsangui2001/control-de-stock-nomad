import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),readMigration=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
let available=true;try{require.resolve('@electric-sql/pglite');}catch{available=false;}
test('atomic and scoped fridge movement, with same-key replay',{skip:!available&&'Install @electric-sql/pglite for isolated SQL QA'},async()=>{
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
create table boat_control.operation_receipts(user_id text,key uuid,request jsonb,result jsonb,created_at timestamptz,primary key(user_id,key));
create table boat_control.audit(boat_id text,user_id text,revision integer);
insert into boat_control.config values(encode(extensions.digest('fixture-secret','sha256'),'hex'));
insert into boat_control.accounts values ('chef','Chef',false),('read','Lector',false),('admin','Admin',true);
insert into boat_control.sessions values('chef','chef-token',now()+interval '1 hour'),('read','read-token',now()+interval '1 hour'),('admin','admin-token',now()+interval '1 hour');
insert into boat_control.members values ('chef','nomad','chef'),('read','nomad','lector');
insert into boat_control.boats values
 ('nomad','Nomadé','{"products":[{"id":"source","name":"Coca Zero","unit":"latas","area":"gastronomia","location":"Depósito bajo cama","current":100,"cost":2,"costKnown":true},{"id":"meat","name":"Carne","unit":"kg","area":"gastronomia","location":"Depósito bajo cama","current":10},{"id":"variant","name":"Coca original","unit":"latas","area":"gastronomia","location":"Recepción a bordo","current":100}],"movements":[]}',0),
 ('pink','Pink','{"products":[],"movements":[]}',0);
`);
const src=readMigration('supabase/migrations/20261124202124_boat_admin_stockroom.sql');
await db.exec(src.slice(src.indexOf('create function boat_control.stockroom_match'),src.indexOf('create function boat_control.stockroom_price')));
const ops=readMigration('supabase/migrations/20261023145110_boat_operations.sql');
const prefix=ops.indexOf('create function boat_control.stock_delta');
const bodyEnd=ops.indexOf('end $$;',prefix)+'end $$;'.length;
await db.exec(ops.slice(prefix,bodyEnd));
await db.exec(readMigration('supabase/migrations/20261127174520_boat_fridge_move.sql'));
const x={boat:'nomad',key:'22222222-2222-4222-8222-222222222222',session:'chef-token',productId:'source',quantity:32};
const call=async(p=x,secret='fixture-secret')=>(await db.query('select public.boat_fridge_move_rpc($1,$2::jsonb) as r',[secret,JSON.stringify(p)])).rows[0].r;
const read=async()=>(await db.query("select state,revision from boat_control.boats where id='nomad'")).rows[0];
const expected={ok:true,fromBalance:68,toBalance:32,quantity:32};
assert.deepEqual(await call(),expected);
assert.deepEqual(await call(),expected);
const row=await read();
assert.equal(row.revision,2);
assert.equal(row.state.movements.length,2);
assert.deepEqual(row.state.movements.map(m=>m.delta),[-32,32]);
assert.equal(row.state.products.filter(p=>p.name==='Coca Zero').reduce((sum,p)=>sum+p.current,0),100);
const f=row.state.products.find(p=>p.location==='Heladera');assert.equal(f.cost,2);assert.equal(f.costKnown,true);
assert.equal(row.state.products.find(p=>p.id==='variant').current,100);
const k2='33333333-3333-4333-8333-333333333333';
for(const p of [{...x,quantity:33},{...x,key:k2,quantity:100},{...x,key:k2,productId:'meat'},{...x,key:k2,productId:f.id},{...x,key:k2,quantity:1.5},{...x,key:k2,session:'read-token'},{...x,key:k2,boat:'pink'}]) await assert.rejects(call(p));
await assert.rejects(call(x,'wrong'));
assert.deepEqual(await read(),row);
// When destination exists but increment fails, the first delta rolls back too.
await db.exec("update boat_control.boats set state=jsonb_set(state,'{products,3,current}','999999999999') where id='nomad'");
await assert.rejects(call({...x,key:k2,quantity:2}));
const after=await read();assert.equal(after.state.products.find(p=>p.id==='source').current,68);assert.equal(after.revision,2);
// The first warehouse package receipt creates this exact inbound location.
const inbound=await call({...x,key:k2,productId:'variant',quantity:6});
assert.deepEqual(inbound,{ok:true,fromBalance:94,toBalance:6,quantity:6});
assert.equal((await read()).state.products.find(p=>p.name==='Coca original'&&p.location==='Heladera').current,6);
console.log('Fridge: 100 → 68 + 32, same-key idempotence, cost and variant isolation, scope checks, atomic rollback, ledger pairs.');
}finally{await db.close();}
});
