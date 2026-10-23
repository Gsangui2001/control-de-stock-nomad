create or replace function boat_control.emit_event(b text, actor text, event_kind text, detail jsonb default '{}') returns void language plpgsql set search_path='' as $$
declare e bigint; begin
 insert into boat_control.events(boat_id,actor_id,kind,detail) values(b,actor,event_kind,detail) returning id into e;
 insert into boat_control.notifications(event_id,user_id)
 select e,a.id from boat_control.accounts a where a.id=actor or a.admin or exists(
  select 1 from boat_control.members m where m.boat_id=b and m.user_id=a.id and (
   m.role in ('capitan','encargado') or (event_kind='tareas_por_atender' and m.role<>'lector' and exists(
    select 1 from boat_control.boats bb cross join lateral jsonb_array_elements(bb.state->'tasks') t where bb.id=b
    and not coalesce((t->>'done')::boolean,false)
    and (coalesce(t->>'assignedRole','') in ('','all') or t->>'assignedRole'=m.role)
    and ((nullif(t->>'nextDate','') is not null and t->>'nextDate'<=(now() at time zone 'America/Panama')::date::text)
      or (nullif(t->>'nextHours','') is not null and exists(select 1 from jsonb_array_elements(bb.state->'boat'->'equipment') eq where eq->>'id'=t->>'equipmentId' and (eq->>'hours')::numeric>=(t->>'nextHours')::numeric)))
   ))
  ));
 insert into boat_control.push_jobs(notification_id,subscription_id)
 select n.id,s.id from boat_control.notifications n join boat_control.push_subscriptions s on s.user_id=n.user_id and s.active where n.event_id=e;
end $$;
