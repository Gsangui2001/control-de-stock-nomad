-- Execute inside BEGIN ... ROLLBACK only, together with the migration on a
-- pre-migration database. No worker runs and no fixture is persisted.
update boat_control.config set secret_hash=encode(extensions.digest('brief-test-secret','sha256'),'hex');
insert into boat_control.accounts(id,name,username,password,admin) values
 ('brief-qa-admin','QA admin','brief-qa-admin','unused',true),('brief-qa-chef','QA chef','brief-qa-chef','unused',false),
 ('brief-qa-capitan','QA captain','brief-qa-capitan','unused',false),('brief-qa-marinero','QA sailor','brief-qa-marinero','unused',false),('brief-qa-other','QA other','brief-qa-other','unused',false);
insert into boat_control.sessions(token,user_id,expires) select id,id,now()+interval '1 hour' from boat_control.accounts where id like 'brief-qa-%';
insert into boat_control.members(user_id,boat_id,role) values
 ('brief-qa-chef','6bf8e2dceb8157d62159ae7bd29967fd','chef'),('brief-qa-capitan','6bf8e2dceb8157d62159ae7bd29967fd','capitan'),('brief-qa-marinero','6bf8e2dceb8157d62159ae7bd29967fd','marinero');
do $$
declare base jsonb='{"boat":"6bf8e2dceb8157d62159ae7bd29967fd","session":"brief-qa-admin"}'; rid uuid; req jsonb; data jsonb; row_data jsonb; failed boolean; n integer; actor text; current_revision integer;
begin
 select rr.id into rid from public.reservations rr where boat_control.crm_reservation_matches(rr.id,base->>'boat') limit 1;
 assert rid is not null,'Nomade fixture source available';
 data=boat_control.briefs('brief-test-secret','reservations',base);
 assert jsonb_array_length(data)>0,'admin sees draft candidates';
 assert boat_control.briefs('brief-test-secret','reservations',base||'{"session":"brief-qa-chef"}')='[]'::jsonb,'unpublished data hidden';
 failed=false;begin perform boat_control.briefs('brief-test-secret','reservations',base||'{"session":"brief-qa-other"}');exception when insufficient_privilege then failed=true;end;assert failed,'cross boat blocked';
 req=base||jsonb_build_object('id',rid,'revision',0,'details',jsonb_build_object('allergies','QA peanuts'),'key',gen_random_uuid());
 failed=false;begin perform boat_control.briefs('brief-test-secret','brief_save',req||'{"session":"brief-qa-chef"}');exception when insufficient_privilege then failed=true;end;assert failed,'crew cannot edit';
 perform boat_control.briefs('brief-test-secret','brief_save',req);
 perform boat_control.briefs('brief-test-secret','brief_save',req);
 assert (select revision from boat_control.reservation_briefs where reservation_id=rid)=1,'draft retries deduplicated';
 failed=false;begin perform boat_control.briefs('brief-test-secret','brief_save',req||jsonb_build_object('key',gen_random_uuid()));exception when others then failed=true;end;assert failed,'stale edit blocked';
 select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base)) where value->>'id'=rid::text;
 req=base||jsonb_build_object('id',rid,'revision',1,'sourceHash',row_data->'brief'->>'sourceHash','key',gen_random_uuid());
 failed=false;begin perform boat_control.briefs('brief-test-secret','brief_publish',req);exception when others then failed=true;end;assert failed,'pending reservation cannot publish';
 update public.reservations set charter_status='confirmed' where id=rid;
 select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base)) where value->>'id'=rid::text;
 req=req||jsonb_build_object('sourceHash',row_data->'brief'->>'sourceHash');
 data=boat_control.briefs('brief-test-secret','brief_publish',req);assert data->>'version'='1','first publication';
 assert boat_control.briefs('brief-test-secret','brief_publish',req)=data,'publication replay';
 select count(*) into n from boat_control.events where kind='brief_published' and detail->>'reservationId'=rid::text;
 assert n=1,'one publication event';
 assert (select count(*) from boat_control.notifications nn join boat_control.events e on e.id=nn.event_id where e.kind='brief_published' and e.detail->>'reservationId'=rid::text and nn.user_id in ('brief-qa-chef','brief-qa-capitan','brief-qa-marinero'))=3,'all crew notified';
 req=req||jsonb_build_object('key',gen_random_uuid(),'revision',2);
 data=boat_control.briefs('brief-test-secret','brief_publish',req);assert data->>'unchanged'='true','no change does not republish';
 foreach actor in array array['brief-qa-chef','brief-qa-capitan','brief-qa-marinero'] loop
  select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base||jsonb_build_object('session',actor))) where value->>'id'=rid::text;
  assert row_data->'details'->>'allergies'='QA peanuts','published content visible';
  assert not (row_data?'crmBalance') and not (row_data->'brief'?'draft'),'no draft or financial leak';
  if actor<>'brief-qa-capitan' then assert not (row_data?'phone'),'contact hidden from kitchen and sailor'; end if;
  req=base||jsonb_build_object('session',actor,'id',rid,'version',1,'key',gen_random_uuid());
  perform boat_control.briefs('brief-test-secret','brief_review',req);perform boat_control.briefs('brief-test-secret','brief_review',req);
 end loop;
 assert (select count(*) from boat_control.brief_reviews where reservation_id=rid)=3,'one review per person and version';
 perform boat_control.briefs('brief-test-secret','brief_save',base||jsonb_build_object('id',rid,'revision',2,'details',jsonb_build_object('allergies','QA updated'),'key',gen_random_uuid()));
 select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base||'{"session":"brief-qa-chef"}')) where value->>'id'=rid::text;
 assert row_data->'details'->>'allergies'='QA peanuts','unpublished changes do not leak';
 select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base)) where value->>'id'=rid::text;
 perform boat_control.briefs('brief-test-secret','brief_publish',base||jsonb_build_object('id',rid,'revision',3,'sourceHash',row_data->'brief'->>'sourceHash','key',gen_random_uuid()));
 failed=false;begin perform boat_control.briefs('brief-test-secret','brief_review',base||jsonb_build_object('session','brief-qa-chef','id',rid,'version',1,'key',gen_random_uuid()));exception when others then failed=true;end;assert failed,'old version review rejected';
 select value into row_data from jsonb_array_elements(boat_control.briefs('brief-test-secret','reservations',base||'{"session":"brief-qa-chef"}')) where value->>'id'=rid::text;
 assert row_data->'brief'->>'reviewedAt' is null,'new version requires review';
 update public.reservations set operational_notes='QA changed after publication' where id=rid;
 failed=false;begin perform boat_control.briefs('brief-test-secret','brief_review',base||jsonb_build_object('session','brief-qa-chef','id',rid,'version',2,'key',gen_random_uuid()));exception when others then failed=true;end;assert failed,'changed CRM cannot be acknowledged';
 update public.reservations set charter_status='cancelled' where id=rid;
 assert boat_control.briefs('brief-test-secret','reservations',base||'{"session":"brief-qa-chef"}')='[]'::jsonb,'cancelled reservation hidden';
 failed=false;begin perform boat_control.briefs('brief-test-secret','external_templates',base||'{"session":"brief-qa-chef"}');exception when insufficient_privilege then failed=true;end;assert failed,'external guest details admin only';
 data=boat_control.briefs('brief-test-secret','external_templates',base);
 assert not exists(select 1 from jsonb_array_elements(data) x where boat_control.crm_reservation_matches((x->>'id')::uuid,base->>'boat')),'Nomade excluded from external templates';
 assert not exists(select 1 from jsonb_array_elements(data) x where lower(trim(x->>'boatName')) in ('nomade','nomad')),'free-text Nomade imports excluded too';
end $$;
