// Local PostgreSQL only. Pass the Nomad CRM migration directory and optional embedded-postgres entrypoint.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [crm,driver]=process.argv.slice(2);
if(!crm)throw Error('Pass the directory of Nomad CRM migrations.');
const {default:EmbeddedPostgres}=await import(driver?pathToFileURL(path.resolve(driver)).href:'embedded-postgres');
const locator=net.createServer();
await new Promise((resolve,reject)=>{locator.once('error',reject);locator.listen(0,'127.0.0.1',resolve);});
const port=locator.address().port;
await new Promise(resolve=>locator.close(resolve));
const directory=await mkdtemp(path.join(tmpdir(),'nomade-guest-plan-'));
const pg=new EmbeddedPostgres({databaseDir:directory,port,user:'fixture',password:randomBytes(20).toString('hex'),persistent:false,createPostgresUser:false,autoRehydrateSymlinks:true,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){}});
const clients=[];
let started=false;
try{
 await pg.initialise();await pg.start();started=true;
 for(let i=0;i<3;i++){const c=pg.getPgClient('postgres','127.0.0.1');await c.connect();clients.push(c);}
 const [db,first,second]=clients;
 await db.query(await readFile(new URL('./boat-captain-cash-fixture.sql',import.meta.url),'utf8'));
 async function actual(file,names){
  const sql=await readFile(path.join(crm,file+'.sql'),'utf8');
  for(const name of names){
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION '+name+'('),end=sql.indexOf('$function$;',start);
   assert.ok(start>=0&&end>start,name);
   await db.query(sql.slice(start,end+'$function$;'.length));
  }
 }
 await actual('20261106193446_finance_payment_review_quarantine',['public.finance_clear_transaction','boat_control.brief_balance','boat_control.brief_payment_receipt','boat_control.settle_captain_payment']);
 await db.query("create function boat_control.brief_source(uuid) returns jsonb language sql stable as $$select jsonb_build_object('id',id,'name','Huésped QA','status',charter_status,'captainBalance',boat_control.brief_balance(id)) from public.reservations where id=$1$$");
 await actual('20261102233000_nomade_ficha_capitan_agenda_cobro',['boat_control.briefs']);
 await db.query('create function public.boat_briefs_rpc(text,text,jsonb) returns jsonb language sql as $$select boat_control.briefs($1,$2,$3)$$');
 const migrations=new URL('../supabase/migrations/',import.meta.url);
 const files=await readdir(migrations);
 for(const suffix of ['_captain_personal_cash.sql','_boat_guest_onboard_plan.sql']){
  const file=files.filter(f=>f.endsWith(suffix));assert.equal(file.length,1);
  await db.query(await readFile(new URL(file[0],migrations),'utf8'));
 }
 const rpc=async(op,args={},actor='captain',conn=first)=>(await conn.query('select public.boat_guest_plan_rpc($1,$2,$3) data',['fixture-only',op,{boat:'nomade',session:actor+'-test-session',...args}])).rows[0].data;
 const opportunity=randomUUID(),id=randomUUID();
 await db.query('insert into opportunities(id) values($1)',[opportunity]);
 await db.query('insert into reservations(id,opportunity_id) values($1,$2)',[id,opportunity]);
 await db.query("insert into boat_control.reservation_links values($1,'nomade','captain')",[id]);
 const changes={embarkation:'Muelle 3',onboardNotes:'Llamar al llegar'};
 const save=(revision,version,values=changes,actor='captain',conn=first,key=randomUUID())=>rpc('guest_plan_save',{id,revision,version,changes:values,key},actor,conn);
 let draft=await rpc('guest_plan',{id});
 assert.equal(draft.revision,0);assert.equal(draft.version,0);
 let calendar=await rpc('agenda');assert.equal(calendar.find(row=>row.id===id).onboardPlan.canEdit,true);
 assert.equal((await rpc('reservations',{},'chef')).length,0);
 const key=randomUUID();
 const saved=await save(0,0,changes,'captain',first,key);
 assert.equal(saved.revision,1);assert.equal(saved.values.embarkation,'Muelle 3');
 assert.deepEqual(await save(0,0,changes,'captain',first,key),saved);
 await assert.rejects(save(0,0,{embarkation:'Otro muelle'},'captain',first,key),e=>e.code==='PT409');
 await assert.rejects(save(1,0,{captainCollection:'collect'}),e=>e.code==='22023');
 await assert.rejects(save(1,0,{name:'Reescritura'}),e=>e.code==='22023');
 for(const who of ['second','chef','sailor'])await assert.rejects(save(1,0,changes,who),e=>e.code==='42501');
 assert.deepEqual((await rpc('agenda',{},'second')).find(row=>row.id===id).onboardPlan.fields,{});
 await assert.rejects(rpc('guest_plan',{boat:'other',id}),e=>e.code==='42501');
 await assert.rejects(rpc('guest_plan',{id:randomUUID()}),e=>e.code==='42501');
 await db.query("insert into finance_booking_state values($1,'known',40,current_date-2)",[opportunity]);
 await db.query("insert into boat_control.reservation_briefs values($1,'nomade',1,1,'{}')",[id]);
 await db.query("insert into boat_control.brief_versions(reservation_id,version,snapshot,source_hash,crm_approval_id) select $1,1,s||jsonb_build_object('details',jsonb_build_object('embarkation','Muelle de administración','drinks','Agua','captainCollection','collect')),encode(extensions.digest((s-'status')::text,'sha256'),'hex'),'00000000-0000-4000-8000-000000000002' from (select boat_control.brief_source($1) s) q",[id]);
 await assert.rejects(save(1,0),e=>e.code==='PT409');
 for(const who of ['chef','captain']){
  const row=(await rpc('reservations',{},who)).find(row=>row.id===id);
  assert.equal(row.details.embarkation,'Muelle 3');assert.equal(row.details.drinks,'Agua');
  assert.equal(row.onboardPlan.canEdit,who==='captain');assert.equal(row.onboardPlan.fields.onboardNotes,changes.onboardNotes);
  assert.equal(row.details.captainCollection,who==='captain'?'collect':undefined);
 }
 assert.ok(!Object.hasOwn((await rpc('guest_plan',{id})).values,'captainCollection'));
 await first.query('begin');
 const update=await save(1,1,{drinks:'Té'},'captain',first);
 assert.equal(update.revision,2);
 const contender=save(1,1,{drinks:'Café'},'admin',second).then(result=>({result}),error=>({error}));
 await first.query('commit');
 const losing=await contender;assert.equal(losing.error?.code,'PT409','a second editor cannot overwrite this change');
 assert.equal((await rpc('guest_plan',{id})).values.drinks,'Té');
 const immutable=(await db.query('select snapshot from boat_control.brief_versions where reservation_id=$1',[id])).rows[0].snapshot;
 assert.equal(immutable.details.drinks,'Agua');assert.equal(immutable.details.captainCollection,'collect');
 assert.equal((await db.query('select count(*)::int n from public.finance_transactions')).rows[0].n,0);
 assert.equal((await db.query("select has_table_privilege('anon','boat_control.guest_plans','select') direct")).rows[0].direct,false);
 await db.query("update boat_control.reservation_links set captain_id='second' where reservation_id=$1",[id]);
 await assert.rejects(save(0,0,changes,'captain',first,key),e=>e.code==='42501');
 assert.equal((await rpc('guest_plan',{id},'second')).values.drinks,'Té');
 console.log('PASS: real CRM agenda and published cards, unpublished assigned plans, roles, revision/publication conflicts, idempotent saves, reassignment and immutable financial authorization.');
}finally{
 await Promise.allSettled(clients.map(c=>c.end()));
 if(started)await pg.stop();
}
