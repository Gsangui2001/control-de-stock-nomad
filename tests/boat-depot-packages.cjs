const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const hasPGlite=(()=>{try{return !!require.resolve('@electric-sql/pglite');}catch{return false;}})();
test('Tierra photographed inbound load is additive; count remains explicit',()=>{
 const s=fs.readFileSync('public/a-bordo/depot-photo.js','utf8');
 assert.match(s,/Ingreso de mercadería · suma lo que llegó/);
 assert.match(s,/Conteo real · reemplaza lo contado/);
});
test('isolated Postgres: 2×24 dispatch, scoped notice/photos, signed full receipt, deduplication, and onboard consumption',
 {skip:!hasPGlite&&'Install @electric-sql/pglite for the isolated SQL test'},async()=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 const pic=randomUUID(), received1=randomUUID(),received2=randomUUID(),signature=randomUUID(),otherPhoto=randomUUID();
 try {
  await db.exec(`create role anon; create role authenticated; create schema boat_control; create schema extensions;
  create function extensions.digest(text,text) returns bytea language sql immutable as $$select decode(md5($1),'hex')$$;
  create table boat_control.config(secret_hash text); insert into boat_control.config values(encode(extensions.digest('fixture','sha256'),'hex'));
  create table boat_control.accounts(id text primary key,name text,admin boolean);
  create table boat_control.sessions(user_id text,token text,expires timestamptz);
  insert into boat_control.accounts values ('a','Admin QA',true),('c','Chef QA',false),('s','Otro barco QA',false),('l','Lector QA',false);
  insert into boat_control.sessions values ('a','admin',now()+interval '1 day'),('c','crew',now()+interval '1 day'),('s','other',now()+interval '1 day'),('l','reader',now()+interval '1 day');
  create table boat_control.boats(id text primary key,name text,state jsonb,revision int);
  insert into boat_control.boats values ('nomade','Nomadé','{"products":[],"movements":[]}',0),('other','Otro','{"products":[],"movements":[]}',0);
  create table boat_control.audit(boat_id text,user_id text,revision int);
  create table boat_control.members(boat_id text,user_id text,role text);
  insert into boat_control.members values('nomade','c','chef'),('nomade','l','lector'),('other','s','marinero');
  create table boat_control.photos(id uuid primary key,boat_id text);
  insert into boat_control.photos values ('${pic}','nomade'),('${received1}','nomade'),('${received2}','nomade'),('${signature}','nomade'),('${otherPhoto}','other');
  create table boat_control.stockroom(id boolean primary key,name text,products jsonb,movements jsonb,revision int);
  insert into boat_control.stockroom values(true,'Tierra','[{"id":"beer","name":"Cerveza","unit":"unidad","location":"Seco","area":"gastronomia","current":60},{"id":"pasta","name":"Fideos","unit":"kg","location":"Seco","area":"gastronomia","current":10}]','[]',0);
  create table boat_control.operation_receipts(user_id text,key uuid,request jsonb,result jsonb,created_at timestamptz,primary key(user_id,key));
  create table boat_control.events(id bigint generated always as identity primary key,boat_id text,actor_id text,kind text,detail jsonb);
  create table boat_control.notifications(id bigint generated always as identity primary key,event_id bigint,user_id text);
  create table boat_control.push_subscriptions(id bigint,user_id text,active boolean);
  insert into boat_control.push_subscriptions values(1,'c',true),(2,'s',true);
  create table boat_control.push_jobs(notification_id bigint,subscription_id bigint);
  create function boat_control.backup_snapshot(text) returns jsonb language sql as $$select '{"transfers":[]}'::jsonb$$;
  `);
  const base=fs.readFileSync('supabase/migrations/20261124202124_boat_admin_stockroom.sql','utf8');
  await db.exec(base.slice(base.indexOf('create function boat_control.stockroom_match('),base.indexOf('create function boat_control.stockroom_price(')));
  await db.exec(process.env.STOCK_DELTA_SQL ? fs.readFileSync(process.env.STOCK_DELTA_SQL,'utf8') : `
   create function boat_control.stock_delta(b text, product jsonb, delta numeric, actor text, reason text) returns jsonb
   language plpgsql as $$declare old jsonb; items jsonb; p jsonb; begin
    select state->'products' into items from boat_control.boats where id=b for update;
    select x into old from jsonb_array_elements(items) x where x->>'id'=product->>'id';
    p=coalesce(old, product||jsonb_build_object('id',gen_random_uuid(),'current',0));
    p=p||jsonb_build_object('current',(p->>'current')::numeric+delta);
    if old is null then items=items||jsonb_build_array(p); else
     select jsonb_agg(case when x->>'id'=old->>'id' then p else x end) into items from jsonb_array_elements(items) x;
    end if;
    update boat_control.boats set state=jsonb_set(jsonb_set(state,'{products}',items),'{movements}',state->'movements'||jsonb_build_array(jsonb_build_object('delta',delta))) where id=b;
    return p; end $$;
  `);
  for(const name of ['20261126204806_stockroom_photo_count','20261126204807_stockroom_packages'])
   await db.exec(fs.readFileSync('supabase/migrations/'+name+'.sql','utf8'));
  const call=(op,args,session='admin',boat='nomade')=>db.query('select public.boat_stockroom_package_rpc($1,$2,$3::jsonb) as data',['fixture','warehouse_package_'+op,JSON.stringify({boat,session,...args})]).then(r=>r.rows[0].data);
  const depot=()=>db.query('select products,movements,revision from boat_control.stockroom').then(r=>r.rows[0]);
  const vessel=()=>db.query("select state from boat_control.boats where id='nomade'").then(r=>r.rows[0].state);
  const load={scope:'depot',mode:'replenish',session:'admin',confirmed:true,key:randomUUID(),revision:0,items:[{productId:'pasta',name:'Fideos',unit:'kg',area:'gastronomia',location:'Seco',quantity:3}]};
  await db.query('select public.boat_stockroom_photo_count_rpc($1,$2::jsonb)',['fixture',JSON.stringify(load)]);
  assert.equal((await depot()).products[1].current,13);
  const send={key:randomUUID(),photo:pic,revision:1,items:[{productId:'beer',packs:2,perPack:24},{productId:'pasta',packs:1,perPack:3}]};
  await assert.rejects(call('send',send,'crew'),/Solo Administración/);
  await assert.rejects(call('send',{...send,photo:otherPhoto}),/foto/);
  await assert.rejects(call('send',{...send,items:[send.items[0],{...send.items[1],packs:50}]}),/Stock insuficiente/);
  assert.deepEqual((await depot()).products.map(p=>p.current),[60,13]);
  const sent=await call('send',send);
  assert.equal(sent.status,'in_transit');
  assert.deepEqual(await call('send',send),sent);
  assert.deepEqual((await depot()).products.map(p=>p.current),[12,10]);assert.deepEqual((await vessel()).products,[]);
  assert.deepEqual((await db.query('select user_id from boat_control.notifications order by user_id')).rows.map(r=>r.user_id),['a','c']);
  assert.equal((await db.query('select count(*)::int n from boat_control.push_jobs')).rows[0].n,1);
  assert.equal(await call('photo',{photo:pic},'crew'),true);
  assert.equal(await call('photo',{photo:received2},'crew'),false);
  assert.equal(await call('photo',{photo:pic},'other','other'),false);
  await assert.rejects(call('list',{},'other'),/Sin acceso/);
  await assert.rejects(call('list',{},'reader'),/Sin acceso/);
  const [pkg]=await call('list',{},'crew');
  assert.equal(pkg.sent_photo,pic);assert.equal(pkg.items[0].sent,48);
  assert.equal('lastInvoiceUnitCost' in pkg.items[0],false);
  const issue={key:randomUUID(),id:pkg.id,photo:received2,note:'El sello está roto'};
  assert.equal((await call('issue',issue,'crew')).status,'review');
  assert.deepEqual((await vessel()).products,[]);
  const receive={key:randomUUID(),id:pkg.id,photo:received1,signature,verified:true};
  await assert.rejects(call('receive',{...receive,photo:pic},'crew'),/foto nueva/);
  await assert.rejects(call('receive',{...receive,verified:false},'crew'),/firmá/);
  await assert.rejects(call('receive',{...receive,signature:otherPhoto},'crew'),/firmá/);
  await assert.rejects(call('receive',{...receive,items:[{lineId:pkg.items[0].id,quantity:46}]},'crew'),/envío completo/);
  assert.deepEqual((await vessel()).products,[]);
  const done=await call('receive',receive,'crew');
  assert.equal(done.status,'received');assert.deepEqual(await call('receive',receive,'crew'),done);
  assert.deepEqual((await vessel()).products.map(p=>p.current),[48,3]);
  await assert.rejects(call('receive',{...receive,key:randomUUID()},'crew'),/ya fue recibido/);
  const [closed]=await call('list',{},'crew');
  assert.equal((await db.query("select jsonb_array_length(boat_control.backup_snapshot('nomade')->'transfers') as n")).rows[0].n,1);
  assert.equal(closed.receipts.length,2);assert.equal(closed.receipts[0].verified,false);assert.equal(closed.receipts[1].photo,received1);
  assert.equal(closed.receipts[1].signature,signature);assert.equal(closed.receipts[1].signedBy,'Chef QA');
  assert.equal(await call('photo',{photo:signature},'crew'),true);
  const [beer]=(await vessel()).products;
  await db.query("select boat_control.stock_delta('nomade',$1::jsonb,-5,'c','Consumo')",[JSON.stringify(beer)]);
  assert.deepEqual((await vessel()).products.map(p=>p.current),[43,3]);
  assert.deepEqual((await depot()).products.map(p=>p.current),[12,10]);
  assert.deepEqual((await depot()).movements.map(m=>m.delta),[3,-48,-3]);
  assert.equal((await db.query('select count(*)::int n from boat_control.events')).rows[0].n,3);
 }finally{await db.close();}
});
