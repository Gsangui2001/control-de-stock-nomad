-- Run only in a transaction that is rolled back. No real account is used.
update boat_control.config set secret_hash=encode(extensions.digest('test-only-operations','sha256'),'hex');
insert into boat_control.accounts(id,name,username,password,admin) values
 ('ops-test-admin','Fixture admin','ops-fixture-admin','unused',true),
 ('ops-test-chef','Fixture chef','ops-fixture-chef','unused',false),
 ('ops-test-reader','Fixture reader','ops-fixture-reader','unused',false);
insert into boat_control.sessions(token,user_id,expires) values ('ops-test-session','ops-test-admin',now()+interval '1 hour'),('ops-chef-session','ops-test-chef',now()+interval '1 hour'),('ops-reader-session','ops-test-reader',now()+interval '1 hour');
insert into boat_control.boats(id,name,state) values
 ('00000000000000000000000000000001','Fixture A','{"schema":1,"boat":{"name":"Fixture A","currency":"USD","equipment":[]},"products":[],"tasks":[],"logs":[],"purchases":[],"movements":[],"cameras":[]}'),
 ('00000000000000000000000000000002','Fixture B','{"schema":1,"boat":{"name":"Fixture B","currency":"USD","equipment":[]},"products":[],"tasks":[],"logs":[],"purchases":[],"movements":[],"cameras":[]}');
insert into boat_control.members values ('ops-test-chef','00000000000000000000000000000001','chef'),('ops-test-reader','00000000000000000000000000000001','lector');
do $$
declare base jsonb='{"session":"ops-test-session","boat":"00000000000000000000000000000001"}';
 req jsonb; res jsonb; qid text; pid text; tid text; qty numeric; failed boolean; reservation uuid; data jsonb;
begin
 req=base||jsonb_build_object('key',gen_random_uuid(),'area','gastronomia','name','Arroz fixture','unit','kg','quantity',10);
 res=boat_control.operations('test-only-operations','request_create',req);qid=res->>'id';
 assert boat_control.operations('test-only-operations','request_create',req)=res,'idempotent request';
 assert (select count(*) from boat_control.requests where boat_id=base->>'boat')=1,'no duplicate';
 failed=false;begin perform boat_control.operations('test-only-operations','request_create',req||'{"quantity":11}');exception when others then failed=true;end;assert failed,'key cannot change payload';
 perform boat_control.operations('test-only-operations','request_status',base||jsonb_build_object('key',gen_random_uuid(),'id',qid,'status','solicitado'));
 failed=false;begin perform boat_control.operations('test-only-operations','request_status',base||jsonb_build_object('session','ops-chef-session','key',gen_random_uuid(),'id',qid,'status','aprobado'));exception when insufficient_privilege then failed=true;end;assert failed,'chef cannot approve';
 perform boat_control.operations('test-only-operations','request_status',base||jsonb_build_object('key',gen_random_uuid(),'id',qid,'status','aprobado'));
 perform boat_control.operations('test-only-operations','request_status',base||jsonb_build_object('key',gen_random_uuid(),'id',qid,'status','comprado'));
 req=base||jsonb_build_object('key',gen_random_uuid(),'id',qid,'quantity',4,'location','Alacena');
 perform boat_control.operations('test-only-operations','request_receive',req);
 perform boat_control.operations('test-only-operations','request_receive',req);
 select state->'products'->0->>'id',(state->'products'->0->>'current')::numeric into pid,qty from boat_control.boats where id=base->>'boat';assert qty=4,'partial receipt once';
 perform boat_control.operations('test-only-operations','request_receive',base||jsonb_build_object('key',gen_random_uuid(),'id',qid,'quantity',6,'productId',pid,'location','Alacena'));
 assert (select status from boat_control.requests where id=qid::uuid)='recibido','receipt complete';
 failed=false;begin perform boat_control.operations('test-only-operations','stock_consume',base||jsonb_build_object('key',gen_random_uuid(),'productId',pid,'quantity',11,'note','Consumo prueba'));exception when others then failed=true;end;assert failed,'negative stock blocked';
 perform boat_control.operations('test-only-operations','transfer_send',base||jsonb_build_object('key',gen_random_uuid(),'productId',pid,'quantity',2,'target','00000000000000000000000000000002'));
 select id::text into tid from boat_control.transfers where source_id=base->>'boat';
 assert (select (state->'products'->0->>'current')::numeric from boat_control.boats where id=base->>'boat')=8,'source debited';
 req=base||jsonb_build_object('key',gen_random_uuid(),'boat','00000000000000000000000000000002','id',tid,'quantity',1,'location','Despensa');
 perform boat_control.operations('test-only-operations','transfer_receive',req);
 perform boat_control.operations('test-only-operations','transfer_receive',req);
 assert (select (state->'products'->0->>'current')::numeric from boat_control.boats where id='00000000000000000000000000000002')=1,'destination increment once';
 assert (select received from boat_control.transfers where id=tid::uuid)=1,'partial transit preserved';
 failed=false;begin perform boat_control.operations('test-only-operations','transfer_cancel',base||jsonb_build_object('key',gen_random_uuid(),'id',tid));exception when others then failed=true;end;assert failed,'cannot cancel after partial reception';
 data=boat_control.operations('test-only-operations','overview',base||'{"session":"ops-chef-session"}');assert jsonb_array_length(data->'fleet')=1,'fleet isolation';
 failed=false;begin perform boat_control.operations('test-only-operations','stock_add',base||jsonb_build_object('session','ops-reader-session','key',gen_random_uuid()));exception when insufficient_privilege then failed=true;end;assert failed,'reader denied';
 select id into reservation from public.reservations limit 1;
 if reservation is not null then
  perform boat_control.operations('test-only-operations','reservation_link',base||jsonb_build_object('key',gen_random_uuid(),'id',reservation));
  perform boat_control.operations('test-only-operations','collection_instruction',base||jsonb_build_object('key',gen_random_uuid(),'id',reservation,'amount',100,'currency','USD','concept','Fixture','dueDate',current_date,'verified',true));
  data=boat_control.operations('test-only-operations','reservations',base||'{"session":"ops-chef-session"}');
  assert data->0->>'collection' is null,'chef must not receive collection';
  assert data->0->>'crmBalance' is null,'chef must not receive CRM balance';
  failed=false;begin perform boat_control.operations('test-only-operations','collection_report',base||jsonb_build_object('session','ops-chef-session','key',gen_random_uuid(),'id',reservation,'amount',100));exception when insufficient_privilege then failed=true;end;assert failed,'chef cannot report collection';
  req=base||jsonb_build_object('key',gen_random_uuid(),'id',reservation,'amount',50);
  perform boat_control.operations('test-only-operations','collection_report',req);perform boat_control.operations('test-only-operations','collection_report',req);
  assert (select count(*) from boat_control.collections where reservation_id=reservation)=1,'collection retry once';
 end if;
 raise notice 'PASS requests, partial receipt, idempotency, stock protection, transfers, role isolation, CRM read and collection permissions';
end $$;
