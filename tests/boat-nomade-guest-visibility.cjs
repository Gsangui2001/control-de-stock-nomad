const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const hasPGlite=(()=>{try{return !!require.resolve('@electric-sql/pglite');}catch{return false;}})();
test('published operational guest details stay visible without leaking the authorized captain amount',{skip:!hasPGlite&&'Install @electric-sql/pglite for isolated SQL QA'},async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite(),trip=randomUUID(),draft=randomUUID();
 try{
  await db.exec(`
   create role anon; create role authenticated; create schema boat_control;
   create table boat_control.accounts(id text primary key,admin boolean);
   create table boat_control.sessions(user_id text,token text,expires timestamptz);
   create table boat_control.members(user_id text,boat_id text,role text);
   create table boat_control.reservation_briefs(reservation_id uuid,boat_id text,published_version int);
   create table boat_control.brief_versions(reservation_id uuid,version int,snapshot jsonb);
   insert into boat_control.accounts values('admin',true),('captain',false),('other',false),('chef',false),('sailor',false),('host',false);
   insert into boat_control.sessions select id,id,now()+interval '1 day' from boat_control.accounts;
   insert into boat_control.members values('captain','nomade','capitan'),('other','nomade','capitan'),('chef','nomade','chef'),('sailor','nomade','marinero'),('host','nomade','encargado');
   insert into boat_control.reservation_briefs values('${trip}','nomade',1),('${draft}','nomade',0);
   insert into boat_control.brief_versions values('${trip}',1,'{"details":{"captainCollection":"collect"}}');
   create function boat_control.is_nomade(b text) returns boolean language sql as $$select b='nomade'$$;
   create function boat_control.captain_assigned(text,uuid,text) returns boolean language sql as $$select $2 is not null and $3='captain'$$;
   create function boat_control.guest_plans_api(text,text,jsonb) returns jsonb language sql as $$
    select case when $2 not in ('agenda','reservations') then '{"ok":true}'::jsonb
     else '[{"id":"${trip}","name":"Grupo prueba","guests":2,"captainBalance":{"amountUsd":1500},"toCollectUsd":1500,
             "details":{"captainCollection":"collect","food":"Sin gluten","onboardNotes":"Nota interna"},
             "passengers":[{"name":"Pasajero prueba","age":31}],"onboardPlan":{"fields":{"onboardNotes":"Nota interna","food":"Sin gluten"}}},
            {"id":"${draft}","captainBalance":{"amountUsd":1500},"details":{"captainCollection":"collect"}},
            {"id":null,"start":"2026-11-27","briefVersion":0}]'::jsonb end
   $$;
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261126211500_nomade_guest_role_projection.sql','utf8'));
  const call=(session,op='reservations',boat='nomade')=>db.query('select public.boat_guest_plan_rpc($1,$2,$3::jsonb) as data',['fixture',op,JSON.stringify({boat,session})]).then(r=>r.rows[0].data);
  for(const op of ['agenda','reservations']){
   const [a,b,m]=await call('captain',op);
   assert.equal(a.captainBalance.amountUsd,1500);assert.equal(a.details.food,'Sin gluten');
   assert.equal(b.captainBalance,undefined);assert.equal(b.details.captainCollection,undefined);assert.equal(m.briefVersion,0);
   for(const role of ['chef','sailor','host','other']){
    const [row]=await call(role,op);
    assert.deepEqual(row.passengers,[{age:31,name:'Pasajero prueba'}]);
    assert.equal(row.toCollectUsd,undefined);assert.equal(row.captainBalance,undefined);assert.equal(row.details.captainCollection,undefined);
    assert.equal(row.details.onboardNotes,undefined);assert.equal(row.onboardPlan.fields.onboardNotes,undefined);
   }
  }
  await db.exec(`update boat_control.brief_versions set snapshot='{"details":{"captainCollection":"office"}}'`);
  const [revoked]=await call('captain');assert.equal(revoked.captainBalance,undefined);
  assert.equal((await call('admin'))[0].captainBalance.amountUsd,1500);
  assert.equal((await call('chef','reservations','other'))[0].captainBalance.amountUsd,1500); // this policy is not a change to other boats
  assert.deepEqual(await call('captain','guest_plan_save'),{ok:true});
 }finally{await db.close();}
});
