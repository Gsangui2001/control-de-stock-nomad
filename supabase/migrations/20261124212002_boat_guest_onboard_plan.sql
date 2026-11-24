-- The captain's operating plan belongs to the boat and reservation. Keep the
-- signed CRM publication and its payment authorization intact when editing it.
create table boat_control.guest_plans (
 boat_id text not null references boat_control.boats(id),
 reservation_id uuid not null references public.reservations(id) on delete cascade,
 revision integer not null check (revision > 0),
 fields jsonb not null check (jsonb_typeof(fields)='object'),
 updated_by text not null references boat_control.accounts(id),
 updated_at timestamptz not null default now(),
 primary key(boat_id,reservation_id)
);
alter table boat_control.guest_plans enable row level security;
revoke all on boat_control.guest_plans from public,anon,authenticated;

create function boat_control.guest_plans_api(server_key text,operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 b text:=payload->>'boat'; a boat_control.accounts%rowtype; r text; result jsonb;
 rid uuid; p boat_control.guest_plans%rowtype; changes jsonb; request_key uuid; prior record; submitted jsonb;
 official jsonb; effective jsonb; published integer; editable boolean;
 allowed constant text[]:=array['embarkation','embarkationTime','disembarkation','disembarkationTime','transport','activities','food','allergies','drinks','requests','onboardNotes'];
begin
 if not exists(select from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select ac.* into a from boat_control.accounts ac join boat_control.sessions s on s.user_id=ac.id
 where s.token=payload->>'session' and s.expires>now();
 if a.id is null then raise exception 'Iniciá sesión.' using errcode='28000'; end if;
 r=case when a.admin then 'administrador' else (select m.role from boat_control.members m where m.boat_id=b and m.user_id=a.id) end;
 if r is null or not exists(select from boat_control.boats where id=b) then raise exception 'Sin acceso al barco.' using errcode='42501'; end if;
 if operation in ('agenda','reservations') then
  result=public.boat_captain_cash_rpc(server_key,operation,payload);
  if not boat_control.is_nomade(b) then return result; end if;
  -- Only decorate rows already released by the existing CRM / boat access rules.
  select coalesce(jsonb_agg(
    (case when operation='reservations' and flags.show_data and gp.fields is not null then
      entry.item||jsonb_build_object('details',coalesce(entry.item->'details',entry.item#>'{brief,draft}','{}'::jsonb)||(gp.fields-'onboardNotes'))
     else entry.item end) ||
    jsonb_build_object('onboardPlan',jsonb_build_object('revision',case when flags.show_data then coalesce(gp.revision,0) else 0 end,
      'fields',case when flags.show_data then coalesce(gp.fields,'{}'::jsonb) else '{}'::jsonb end,'canEdit',rights.can_edit))
    order by entry.n),'[]'::jsonb) into result
   from jsonb_array_elements(result) with ordinality as entry(item,n)
   left join boat_control.guest_plans gp on gp.boat_id=b and gp.reservation_id=(entry.item->>'id')::uuid
   cross join lateral (select (a.admin or (r='capitan' and boat_control.captain_assigned(b,(entry.item->>'id')::uuid,a.id)))
      and coalesce(entry.item->>'status','confirmed') in ('confirmed','in_progress','completed') as can_edit) rights
   cross join lateral (select rights.can_edit or (operation='reservations' and coalesce((entry.item#>>'{brief,version}')::integer,0)>0)
      as show_data) flags;
  return result;
 end if;
 if operation not in ('guest_plan','guest_plan_save') then raise exception 'Operación desconocida.' using errcode='22023';end if;
 if not boat_control.is_nomade(b) or r not in ('administrador','capitan') then raise exception 'Sin permiso para editar esta ficha.' using errcode='42501';end if;
 rid=(payload->>'id')::uuid;
 if operation='guest_plan_save' then
  request_key=(payload->>'key')::uuid;
  changes=payload->'changes';
  if request_key is null or jsonb_typeof(changes) is distinct from 'object' or changes='{}'::jsonb then
    raise exception 'Completá al menos un cambio.' using errcode='22023';
  end if;
  if exists(select from jsonb_each(changes) f where not(f.key=any(allowed)) or jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>2000) then
    raise exception 'Revisá los campos del plan a bordo.' using errcode='22023';
  end if;
  submitted=(payload-'session')||jsonb_build_object('operation',operation);
  perform pg_advisory_xact_lock(hashtextextended(a.id||request_key::text,0));
  -- Serialize edits with CRM publication and with the first insert of a plan.
  perform 1 from public.reservations rr where rr.id=rid for update;
  perform 1 from boat_control.reservation_links l where l.reservation_id=rid for share;
 end if;
 editable=a.admin or boat_control.captain_assigned(b,rid,a.id);
 if not editable or not exists(select from public.reservations rr join public.opportunities o on o.id=rr.opportunity_id
     where rr.id=rid and not o.is_archived and rr.charter_status in ('confirmed','in_progress','completed')
     and boat_control.crm_reservation_matches(rr.id,b)) then
   raise exception 'Sin permiso para editar esta salida.' using errcode='42501';
 end if;
 if operation='guest_plan_save' then
  select h.request,h.result into prior from boat_control.operation_receipts h where h.user_id=a.id and h.key=request_key;
  if found then
   if prior.request<>submitted then raise exception 'Identificador reutilizado con otros cambios.' using errcode='PT409';end if;
   return prior.result;
  end if;
 end if;
 select coalesce(f.published_version,0),v.snapshot->'details' into published,official
  from boat_control.reservation_briefs f left join boat_control.brief_versions v on v.reservation_id=f.reservation_id and v.version=f.published_version
  where f.boat_id=b and f.reservation_id=rid;
 published=coalesce(published,0);
 select * into p from boat_control.guest_plans gp where gp.boat_id=b and gp.reservation_id=rid;
 if operation='guest_plan_save' then
  if (payload->>'revision')::integer is distinct from coalesce(p.revision,0) or (payload->>'version')::integer is distinct from published then
    raise exception 'La ficha cambió. Revisá los cambios antes de guardar.' using errcode='PT409';
  end if;
  insert into boat_control.guest_plans as current(boat_id,reservation_id,revision,fields,updated_by)
    values(b,rid,1,changes,a.id)
    on conflict(boat_id,reservation_id) do update set revision=current.revision+1,fields=current.fields||excluded.fields,
     updated_by=excluded.updated_by,updated_at=clock_timestamp() returning * into p;
 end if;
 select coalesce(jsonb_object_agg(f.key,f.value),'{}'::jsonb) into effective from jsonb_each(coalesce(official,'{}'::jsonb)||coalesce(p.fields,'{}'::jsonb)) f
  where f.key=any(allowed) and jsonb_typeof(f.value)='string';
 result=jsonb_build_object('revision',coalesce(p.revision,0),'version',published,'fields',coalesce(p.fields,'{}'::jsonb),'values',effective,'canEdit',true);
 if operation='guest_plan_save' then
  insert into boat_control.operation_receipts(user_id,key,request,result) values(a.id,request_key,submitted,result);
 end if;
 return result;
end $$;
revoke all on function boat_control.guest_plans_api(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.guest_plans_api(text,text,jsonb) to anon,authenticated;
create function public.boat_guest_plan_rpc(server_key text,operation text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select boat_control.guest_plans_api(server_key,operation,payload) $$;
revoke all on function public.boat_guest_plan_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.boat_guest_plan_rpc(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
