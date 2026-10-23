-- Run after boat-operations.sql inside the same BEGIN / ROLLBACK transaction.
do $$ declare sid uuid; jobs jsonb; job jsonb; begin
 insert into boat_control.push_subscriptions(user_id,endpoint,subscription) values('ops-test-chef','https://fcm.googleapis.com/test-rollback-only','{}') returning id into sid;
 perform boat_control.emit_event('00000000000000000000000000000001','ops-test-chef','push_test','{}');
 jobs=boat_control.push_worker('test-only-operations','claim','{"limit":20}');
 assert jsonb_array_length(jobs)=1,'one eligible delivery';
 job=jobs->0;
 assert jsonb_array_length(boat_control.push_worker('test-only-operations','claim','{"limit":20}'))=0,'lease excludes duplicate worker';
 perform boat_control.push_worker('test-only-operations','finish',jsonb_build_object('id',job->'id','lease',now()-interval '1 day','status','sent'));
 assert (select status from boat_control.push_jobs where id=(job->>'id')::bigint)='sending','stale lease cannot finish';
 perform boat_control.push_worker('test-only-operations','finish',jsonb_build_object('id',job->'id','lease',job->'lease_until','status','retry'));
 assert (select status='retry' and next_attempt>now() from boat_control.push_jobs where id=(job->>'id')::bigint),'retry scheduled';
 update boat_control.push_jobs set next_attempt=now()-interval '1 minute' where id=(job->>'id')::bigint;
 job=boat_control.push_worker('test-only-operations','claim','{"limit":20}')->0;
 perform boat_control.push_worker('test-only-operations','finish',jsonb_build_object('id',job->'id','lease',job->'lease_until','status','expired'));
 assert (select not active from boat_control.push_subscriptions where id=sid),'expired endpoint disabled';
 update boat_control.boats set state=jsonb_set(state,'{tasks}',jsonb_build_array(jsonb_build_object('id','reminder-test','assignedRole','chef','done',false,'nextDate',current_date::text))) where id='00000000000000000000000000000001';
 perform boat_control.emit_event('00000000000000000000000000000001',null,'tareas_por_atender','{}');
 assert exists(select 1 from boat_control.notifications n join boat_control.events e on e.id=n.event_id where e.kind='tareas_por_atender' and n.user_id='ops-test-chef'),'chef receives own task reminder';
 assert not exists(select 1 from boat_control.notifications n join boat_control.events e on e.id=n.event_id where e.kind='tareas_por_atender' and n.user_id='ops-test-reader'),'reader gets no task push';
end $$;
