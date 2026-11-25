// Usage: node tests/boat-captain-cash.mjs <CRM migrations directory> [embedded-postgres module path]
// Starts a fresh loopback-only database. No production connection or configuration is read.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [crm,driver]=process.argv.slice(2);
if(!crm)throw Error('Pass the directory containing the Nomad CRM migrations.');
const {default:EmbeddedPostgres}=await import(driver?pathToFileURL(path.resolve(driver)).href:'embedded-postgres');
const locator=net.createServer();
await new Promise((resolve,reject)=>{locator.once('error',reject);locator.listen(0,'127.0.0.1',resolve);});
const port=locator.address().port;
await new Promise(resolve=>locator.close(resolve));
const directory=await mkdtemp(path.join(tmpdir(),'nomade-test-captain-cash-'));
const pg=new EmbeddedPostgres({databaseDir:directory,port,user:'fixture',password:randomBytes(20).toString('hex'),persistent:false,createPostgresUser:false,autoRehydrateSymlinks:true,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog(){},onError(){}});
const clients=[];
let started=false;
try{
 await pg.initialise();await pg.start();started=true;
 for(let i=0;i<3;i++){const c=pg.getPgClient('postgres','127.0.0.1');await c.connect();clients.push(c);}
 const [db,first,second]=clients;
 const query=async(sql,args)=> (await db.query(sql,args)).rows;
 await db.query(await readFile(new URL('./boat-captain-cash-fixture.sql',import.meta.url),'utf8'));
 async function actual(filename,functions){
  const sql=await readFile(path.join(crm,filename+'.sql'),'utf8');
  for(const name of functions){
   const start=sql.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');
   const end=sql.indexOf('$function$;',start);
   assert.ok(start>=0&&end>start,name);
   await db.query(sql.slice(start,end+'$function$;'.length));
  }
 }
 await actual('20261106193446_finance_payment_review_quarantine',['public.finance_clear_transaction','boat_control.brief_balance','boat_control.brief_payment_receipt','boat_control.settle_captain_payment']);
 await db.query("create function boat_control.brief_source(uuid) returns jsonb language sql stable as $$select jsonb_build_object('id',id,'name','Huésped QA','status',charter_status,'captainBalance',boat_control.brief_balance(id)) from public.reservations where id=$1$$");
 await actual('20261102233000_nomade_ficha_capitan_agenda_cobro',['boat_control.briefs']);
 await db.query('create function public.boat_briefs_rpc(text,text,jsonb) returns jsonb language sql as $$select boat_control.briefs($1,$2,$3)$$');
 await db.query(await readFile(new URL('../supabase/migrations/20261124202222_captain_personal_cash.sql',import.meta.url),'utf8'));
 // Applied on top of the production version: every assertion below runs against the handover release.
 await db.query(await readFile(new URL('../supabase/migrations/20261125140000_captain_cash_handovers.sql',import.meta.url),'utf8'));
 async function rpc(op,args={},user='captain',client=first){
  const q=await client.query('select public.boat_captain_cash_rpc($1,$2,$3) as data',['fixture-only',op,{boat:'nomade',session:user+'-test-session',...args}]);
  return q.rows[0].data;
 }
 async function charter(amount,mode='collect',captain='captain'){
  const id=randomUUID(),opportunity=randomUUID();
  await db.query('insert into opportunities(id) values ($1)',[opportunity]);
  await db.query('insert into reservations(id,opportunity_id) values ($1,$2)',[id,opportunity]);
  await db.query('insert into boat_control.reservation_links values($1,$2,$3)',[id,'nomade',captain]);
  await db.query("insert into finance_booking_state values($1,'known',$2,current_date-1)",[opportunity,amount]);
  await db.query("insert into boat_control.reservation_briefs values($1,'nomade',1,1,'{}')",[id]);
  await db.query("insert into boat_control.brief_versions(reservation_id,version,snapshot,source_hash,crm_approval_id) select $1,1,s||jsonb_build_object('details',jsonb_build_object('captainCollection',$2::text)),encode(extensions.digest((s-'status')::text,'sha256'),'hex'),'00000000-0000-4000-8000-000000000002' from (select boat_control.brief_source($1) s) q",[id,mode]);
  return {id,opportunity};
 }
 const pay=(r,actor='captain',client=first,key=randomUUID())=>rpc('brief_payment',{id:r.id,version:1,key},actor,client);
 const cash=async(actor='captain')=>(await rpc('captain_wallet',{},actor)).wallets;
 const balance=async(currency)=>(await cash())[0].balances.find(b=>b.currency===currency)?.balance;
 const opening=(currency,amount,key=randomUUID())=>rpc('captain_opening',{captainId:'captain',currency,amount,key},'admin');
 const spend=(currency,amount,key=randomUUID(),client=first)=>rpc('captain_expense',{currency,amount,key,concept:'Provisión de prueba'},'captain',client);
 // Wait for a real DB lock, then release the transaction. Distinct clients prove cross-request serialization.
 async function race(before,after){
  await first.query('begin');const committed=await before();
  const pending=after().then(result=>({result}),error=>({error}));
  const deadline=Date.now()+10000;let blocked=false;
  while(Date.now()<deadline){
   const rows=await query("select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and datname=current_database()");
   if(rows[0].n>0){blocked=true;break;}await new Promise(r=>setTimeout(r,20));
  }
  await first.query('commit');const contender=await pending;assert.ok(blocked,'simultaneous transactions actually waited');
  return [committed,contender];
 }
 assert.equal((await cash()).length,1);assert.equal((await cash('admin')).length,2);
 assert.equal(await balance('USD'),null);
 for(const who of ['chef','sailor'])await assert.rejects(rpc('captain_wallet',{},who),/no disponible/);
 await assert.rejects(rpc('captain_wallet',{boat:'other'}),/Sin acceso/);
 await assert.rejects(rpc('captain_opening',{captainId:'captain',currency:'USD',amount:0,key:randomUUID()}),/administración/);
 await assert.rejects(rpc('collection_report'),/ficha publicada/);
 const historic=await charter(45);await pay(historic);
 assert.equal(await balance('USD'),null);
 const openingKey=randomUUID();await opening('USD',10,openingKey);await opening('USD',10,openingKey);
 await assert.rejects(opening('USD',90,openingKey),/reutilizado/);
 await assert.rejects(opening('USD',11),/ya tiene/);
 assert.equal(await balance('USD'),10);await opening('EUR',28);
 const own=await charter(100);const key=randomUUID();
 const [paid,again]=await race(()=>pay(own,'captain',first,key),()=>pay(own,'captain',second));
 assert.deepEqual(paid,again.result);assert.equal(paid.payment.status,'cleared');assert.equal(paid.payment.balanceUsd,0);
 assert.deepEqual(await pay(own,'captain',second,key),paid);
 assert.equal(await balance('USD'),110);assert.equal(await balance('EUR'),28);
 const [tx]=await query("select count(*)::int n,min(amount_usd)::int amount,min(account_label) destination,min(payment_method) method,bool_and(occurred_at is not null) dated from finance_transactions where opportunity_id=$1",[own.opportunity]);
 assert.deepEqual(tx,{n:1,amount:100,destination:'Caja del capitán · Nomade',method:'cash',dated:true});
 assert.equal((await query("select count(*)::int n from finance_allocations a join finance_transactions t on t.id=a.transaction_id where t.opportunity_id=$1 and a.allocation_type='owned_boat_advance'",[own.opportunity]))[0].n,1);
 const no=await charter(70,'pending');await assert.rejects(pay(no),/autorizar/);
 const other=await charter(60,'collect','second');await assert.rejects(pay(other),/otro capitán/);
 await pay(other,'second');assert.equal(await balance('USD'),110);
 const legacy=await charter(80);await db.query("insert into boat_control.collections values($1,'cobrado')",[legacy.id]);await assert.rejects(pay(legacy),/cobro anterior/);
 const drift=await charter(99);await db.query("insert into finance_transactions(opportunity_id,kind,status,amount_usd,charter_credit_usd,payment_method,occurred_at) values($1,'direct_owner_payment','cleared',90,90,'direct_to_owner',now())",[drift.opportunity]);
 await assert.rejects(pay(drift),/vigente/);assert.equal(await balance('USD'),110);
 const quarantine=await charter(30);await db.query('insert into fixture_reviews values($1,null)',[quarantine.opportunity]);
 await assert.rejects(pay(quarantine),/vigente|Revisión/);
 const list=await rpc('reservations');const hidden=list.find(r=>r.id===other.id);assert.equal(hidden.cashAssigned,false);
 assert.ok(!('captainBalance' in hidden)&&!('captainPayment' in hidden));assert.equal(list.find(r=>r.id===legacy.id).cashLegacyReview,true);
 const agenda=await rpc('agenda');assert.ok(!('toCollectUsd' in agenda.find(r=>r.id===no.id)));
 const expenseKey=randomUUID();const [expense,remaining]=await race(()=>spend('USD',80,expenseKey),()=>spend('USD',80,randomUUID(),second));
 assert.match(remaining.error?.message||'',/supera el efectivo/);assert.deepEqual(await spend('USD',80,expenseKey),expense);
 assert.equal(await balance('USD'),30);assert.equal(await balance('EUR'),28);assert.equal((await cash())[0].expenses.length,1);
 await assert.rejects(spend('USD',0.001),/moneda e importe/);
 const [snapshot]=await query("select count(*)::int n from boat_control.brief_payment_reports where reservation_id=any($1::uuid[])",[[no.id,legacy.id,drift.id,quarantine.id]]);assert.equal(snapshot.n,0);
 // Handovers: administration records the cash the captain hands over to Nomad.
 const handover=(currency,amount,key=randomUUID(),client=first,extra={})=>rpc('captain_handover',{captainId:'captain',currency,amount,key,...extra},'admin',client);
 const alerts=()=>query("select dedupe_key,channel,body,status from internal_alert_outbox where dedupe_key like 'captain-handover:%' order by body");
 const money=async(currency,amount)=>(await query('select boat_control.captain_cash_money($1,$2::numeric) t',[currency,amount]))[0].t;
 for(const [amount,text] of [[1680,'USD 1.680'],[1680.5,'USD 1.680,50'],[1234.567,'USD 1.234,57'],[1000000,'USD 1.000.000'],[1e9,'USD 1.000.000.000'],[0,'USD 0'],[0.5,'USD 0,50']])
  assert.equal(await money('USD',amount),text);
 assert.equal(await money('EUR',28),'EUR 28');
 for(const who of ['captain','second','chef','sailor'])await assert.rejects(rpc('captain_handover',{captainId:'captain',currency:'USD',amount:1,key:randomUUID()},who),/administración/);
 await assert.rejects(handover('USD',30.01),/supera el efectivo que tiene el capitán \(USD 30\)/);
 await assert.rejects(handover('ARS',1),/conteo inicial en ARS/);
 await assert.rejects(rpc('captain_handover',{captainId:'second',currency:'USD',amount:1,key:randomUUID()},'admin'),/conteo inicial en USD/);
 await assert.rejects(rpc('captain_handover',{captainId:'chef',currency:'USD',amount:1,key:randomUUID()},'admin'),/Capitán incorrecto/);
 await assert.rejects(handover('USD',0),/importe entregado/);
 await assert.rejects(handover('USD',0.001),/moneda e importe/);
 await assert.rejects(handover('USD',1,randomUUID(),first,{note:'x'.repeat(141)}),/140/);
 assert.deepEqual(await alerts(),[]);
 const handoverKey=randomUUID(),note={note:'  Sobre cerrado, recibido en la oficina  '};
 const delivered=await handover('USD',20,handoverKey,first,note);
 assert.deepEqual(await handover('USD',20,handoverKey,second,note),delivered);
 await assert.rejects(handover('USD',25,handoverKey,first,note),/reutilizado/);
 assert.deepEqual((await cash())[0].balances.find(b=>b.currency==='USD'),{currency:'USD',opening:10,incoming:100,spent:80,balance:10,handed_over:20});
 // The CRM's PR #365 reads these columns by name with dynamic SQL.
 assert.deepEqual(await query("select t.opening,t.balance from boat_control.captain_balances($1,$2) t where t.currency='USD'",['nomade','captain']),[{opening:'10.00',balance:'10.00'}]);
 const [entry]=(await cash())[0].handovers;
 assert.deepEqual({...entry,at:undefined},{id:delivered.entryId,currency:'USD',amount:20,concept:'Sobre cerrado, recibido en la oficina',receivedBy:'Administración QA',at:undefined});
 assert.deepEqual((await cash('admin')).find(w=>w.captainId==='captain').handovers.map(h=>h.id),[delivered.entryId]);
 assert.deepEqual((await cash('admin')).find(w=>w.captainId==='second').handovers,[]);
 assert.deepEqual(await alerts(),[{dedupe_key:'captain-handover:'+delivered.entryId,channel:'commercial_group',status:'pending',
  body:'📤 Entrega de efectivo · Nomade\nEl capitán entregó USD 20.\nQueda en la caja del capitán: USD 10.'}]);
 // Expenses and handovers share the wallet lock. Whichever commits first leaves less cash for the other.
 const [given,spentLate]=await race(()=>handover('USD',6),()=>spend('USD',6,randomUUID(),second));
 assert.equal(given.ok,true);assert.match(spentLate.error?.message||'',/supera el efectivo/);
 const [spentFirst,givenLate]=await race(()=>spend('USD',4),()=>handover('USD',4,randomUUID(),second));
 assert.equal(spentFirst.ok,true);assert.match(givenLate.error?.message||'',/supera el efectivo que tiene el capitán \(USD 0\)/);
 assert.equal(await balance('USD'),0);assert.equal((await cash())[0].handovers.length,2);assert.equal((await alerts()).length,2);
 // Another boat uses its own name in the alert; amounts keep the Spanish format.
 await db.query("insert into boat_control.members values('other','captain','capitan')");
 await rpc('captain_opening',{boat:'other',captainId:'captain',currency:'USD',amount:2000,key:randomUUID()},'admin');
 await rpc('captain_handover',{boat:'other',captainId:'captain',currency:'USD',amount:1000.5,key:randomUUID()},'admin');
 assert.equal((await alerts()).find(a=>a.body.includes('Otro barco')).body,'📤 Entrega de efectivo · Otro barco QA\nEl capitán entregó USD 1.000,50.\nQueda en la caja del capitán: USD 999,50.');
 for(const {body} of await alerts())assert.doesNotMatch(body,/Capitán QA|Administración QA|Sobre/);
 for(const staff of ['chef','sailor']) {
  const cards=await rpc('reservations',{},staff);
  assert.ok(cards.length);for(const card of cards)for(const field of ['reports','collection','captainBalance','captainPayment'])assert.ok(!(field in card));
 }
 await db.query("update boat_control.reservation_links set captain_id='second' where reservation_id=$1",[own.id]);
 await assert.rejects(pay(own,'second'),/otra caja/);
 assert.equal((await rpc('reservations',{},'second')).find(r=>r.id===own.id).cashAssigned,false);
 await db.query('insert into fixture_reviews select opportunity_id,id from finance_transactions where opportunity_id=$1',[own.opportunity]);
 assert.equal(await balance('USD'),null);assert.equal(await balance('EUR'),28);
 await assert.rejects(spend('USD',1),/en revisión/);
 await assert.rejects(handover('USD',1),/cobro en revisión/);
 const euros=await handover('EUR',28);assert.equal(await balance('EUR'),0);
 assert.equal((await alerts()).find(a=>a.dedupe_key==='captain-handover:'+euros.entryId).body,'📤 Entrega de efectivo · Nomade\nEl capitán entregó EUR 28.\nQueda en la caja del capitán: EUR 0.');
 console.log('PASS · physical cash per captain/currency, initial count and idempotent expenses; approval, legacy, owner payments and finance review; concurrent CRM receipts and expenses in separate database sessions; handovers recorded by administration only, capped by the known balance, idempotent, serialized with expenses, with one nameless Telegram alert each.');
}finally{
 for(const c of clients)await c.end().catch(()=>{});
 if(started)await pg.stop();
}
