create table boat_control.reminder_days(boat_id text not null references boat_control.boats(id),day date not null,primary key(boat_id,day));
alter table boat_control.reminder_days enable row level security;
revoke all on boat_control.reminder_days from public,anon,authenticated;
create function public.boat_reminders_rpc(server_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b record; pending integer; local_day date=(now() at time zone 'America/Panama')::date; inserted integer; begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 -- Morning summary, at most once per boat/day. No manufactured dates/hours.
 if extract(hour from now() at time zone 'America/Panama')<8 then return '{"ok":true}'; end if;
 for b in select id,state from boat_control.boats loop
  select count(*) into pending from jsonb_array_elements(b.state->'tasks') t
   where coalesce((t->>'done')::boolean,false)=false and (
    (nullif(t->>'nextDate','') is not null and t->>'nextDate'<=local_day::text) or
    (nullif(t->>'nextHours','') is not null and exists(select 1 from jsonb_array_elements(b.state->'boat'->'equipment') e where e->>'id'=t->>'equipmentId' and (e->>'hours')::numeric>=(t->>'nextHours')::numeric)));
  if pending>0 then
   insert into boat_control.reminder_days values(b.id,local_day) on conflict do nothing;
   get diagnostics inserted=row_count;
   if inserted>0 then perform boat_control.emit_event(b.id,null,'tareas_por_atender',jsonb_build_object('count',pending)); end if;
  end if;
 end loop;
 return '{"ok":true}';
end $$;
revoke all on function public.boat_reminders_rpc(text) from public,authenticated;
grant execute on function public.boat_reminders_rpc(text) to anon;
