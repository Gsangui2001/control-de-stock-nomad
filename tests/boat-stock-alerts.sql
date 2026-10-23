-- Run as a single transaction. All fixture rows and notifications roll back.
begin;
do $$
declare b text=gen_random_uuid()::text; c text=gen_random_uuid()::text; h text=gen_random_uuid()::text; m text=gen_random_uuid()::text; l text=gen_random_uuid()::text; p jsonb; count_events integer;
begin
 insert into boat_control.accounts(id,name,username,password,admin)
 values(c,'QA captain',c,'not-a-login',false),(h,'QA chef',h,'not-a-login',false),(m,'QA sailor',m,'not-a-login',false),(l,'QA reader',l,'not-a-login',false);
 insert into boat_control.boats(id,name,state) values(b,'QA rollback stock alerts','{"products":[],"tasks":[],"boat":{"equipment":[]}}');
 insert into boat_control.members(user_id,boat_id,role) values(c,b,'capitan'),(h,b,'chef'),(m,b,'marinero'),(l,b,'lector');
 insert into boat_control.push_subscriptions(user_id,endpoint,subscription) values(h,'https://fcm.googleapis.com/QA-rollback-'||b,'{}');
 p='{"id":"qa","name":"Arroz QA","unit":"kg","location":"Alacena","current":10,"min":3}'::jsonb;
 update boat_control.boats set state=jsonb_set(state,'{products}',jsonb_build_array(p)) where id=b;
 if exists(select 1 from boat_control.events where boat_id=b) then raise exception 'Healthy stock alerted';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','3') where id=b;
 if (select count(*) from boat_control.events where boat_id=b and kind='stock_minimo')<>1 then raise exception 'Exact minimum missing';end if;
 if (select count(*) from boat_control.notifications n join boat_control.events e on e.id=n.event_id where e.boat_id=b and n.user_id in(c,h,m))<>3 then raise exception 'Crew recipient missing';end if;
 if exists(select 1 from boat_control.notifications n join boat_control.events e on e.id=n.event_id where e.boat_id=b and n.user_id=l) then raise exception 'Read-only recipient';end if;
 if (select count(*) from boat_control.push_jobs j join boat_control.notifications n on n.id=j.notification_id join boat_control.events e on e.id=n.event_id where e.boat_id=b)<>1 then raise exception 'Durable push missing';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','2') where id=b;
 update boat_control.boats set state=state where id=b;
 if (select count(*) from boat_control.events where boat_id=b)<>1 then raise exception 'Repeated low alert';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','0') where id=b;
 if (select count(*) from boat_control.events where boat_id=b and kind='stock_agotado')<>1 then raise exception 'Zero escalation missing';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','1') where id=b;
 if (select count(*) from boat_control.events where boat_id=b)<>2 then raise exception 'Partial refill spam';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','4') where id=b;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','3') where id=b;
 if (select count(*) from boat_control.events where boat_id=b)<>3 then raise exception 'Alert did not rearm';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,min}','0') where id=b;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','1') where id=b;
 if (select count(*) from boat_control.events where boat_id=b)<>3 then raise exception 'Unknown minimum invented';end if;
 update boat_control.boats set state=jsonb_set(state,'{products,0,current}','0') where id=b;
 update boat_control.boats set state=jsonb_set(state,'{products}','[]') where id=b;
 update boat_control.boats set state=jsonb_set(state,'{products}',jsonb_build_array(p||'{"current":0,"min":0}')) where id=b;
 if (select count(*) from boat_control.events where boat_id=b)<>5 then raise exception 'Initial zero count missing';end if;
 if not exists(select 1 from boat_control.events where boat_id=b and detail->>'name'='Arroz QA' and detail->>'unit'='kg' and detail->>'location'='Alacena') then raise exception 'Product detail missing';end if;
end $$;
rollback;
select 'PASS: thresholds, no repeats, zero escalation, partial/full replenishment, undefined minima, initial zero, three crew recipients, reader excluded, durable queue, details; rolled back' as result;
