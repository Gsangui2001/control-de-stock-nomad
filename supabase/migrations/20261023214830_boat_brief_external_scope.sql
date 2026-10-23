-- Free-text imports of the owned boat require CRM reconciliation, not external captain templates.
create or replace function boat_control.briefs(server_key text, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u boat_control.accounts%rowtype; b text=payload->>'boat'; r text; rid uuid; f boat_control.reservation_briefs%rowtype; v boat_control.brief_versions%rowtype;
 source jsonb; source_hash text; result jsonb='[]'; row_data jsonb; item jsonb; meta jsonb; reviews jsonb; old_request jsonb; receipt jsonb;
 key_id uuid; ev_id bigint; fields jsonb; k text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 r=case when u.admin then 'administrador' else (select role from boat_control.members where boat_id=b and user_id=u.id) end;
 if r is null or not exists(select 1 from boat_control.boats where id=b) then raise exception 'Sin acceso al barco' using errcode='42501'; end if;

 if operation='external_templates' then
  if not u.admin then raise exception 'Solo administración' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(z.data order by z.start),'[]') from (
   select o.desired_start_date as start,boat_control.brief_source(rr.id)||jsonb_build_object('boatName',coalesce(cb.vessel_name,o.external_vessel_name),'captainName',rr.captain_name,'captainPhone',rr.captain_phone) as data
   from public.reservations rr join public.opportunities o on o.id=rr.opportunity_id
   left join public.opportunity_boats ob on ob.opportunity_id=o.id and ob.relationship_type='booked'
   left join public.boats cb on cb.id=ob.boat_id
   where not o.is_archived and rr.charter_status not in ('cancelled','completed') and coalesce(o.desired_end_date,o.desired_start_date)>=current_date
   and (ob.boat_id is not null or nullif(o.external_vessel_name,'') is not null)
   and o.vessel_inventory_type<>'own_vessel'
   and lower(regexp_replace(translate(coalesce(cb.vessel_name,o.external_vessel_name,''),'áéíóú','aeiou'),'\s+','','g')) not in ('nomade','nomad')
   and (ob.boat_id is not null or not exists(select 1 from public.opportunity_boats chosen where chosen.opportunity_id=o.id and chosen.relationship_type in ('booked','selected')))
   and not exists(select 1 from public.opportunity_boats x where x.opportunity_id=o.id and x.relationship_type in ('booked','selected') and (x.boat_id='940161fe-c9fe-48a9-93d9-0928f54d539c'::uuid or x.boat_id<>ob.boat_id))
  )z);
 end if;
 if not boat_control.is_nomade(b) then
  if operation='reservations' then return '[]'; end if;
  raise exception 'Las fichas en la app son exclusivas del Nomade' using errcode='42501';
 end if;
 if operation='reservations' then
  if not u.admin and r not in ('capitan','chef','marinero','encargado') then return '[]'; end if;
  -- Preserve existing collection authorization, but replace all crew-facing CRM
  -- fields with the explicitly published version. Drafts never reach the crew.
  for row_data in select value from jsonb_array_elements(boat_control.operations(server_key,'reservations',payload)) loop
   rid=(row_data->>'id')::uuid;
   if not boat_control.crm_reservation_matches(rid,b) then continue; end if;
   source=boat_control.brief_source(rid);
   select * into f from boat_control.reservation_briefs where reservation_id=rid and boat_id=b;
   select * into v from boat_control.brief_versions where reservation_id=rid and version=f.published_version;
   if not u.admin and (v.version is null or source->>'status' not in ('confirmed','in_progress')) then continue; end if;
   select coalesce(jsonb_agg(jsonb_build_object('name',a.name,'role',m.role,'reviewedAt',rv.reviewed_at) order by m.role,a.name),'[]') into reviews
   from boat_control.members m join boat_control.accounts a on a.id=m.user_id
   left join boat_control.brief_reviews rv on rv.reservation_id=rid and rv.version=f.published_version and rv.user_id=a.id
   where m.boat_id=b and m.role in ('capitan','chef','marinero','encargado');
   source_hash=encode(extensions.digest((source-'status')::text,'sha256'),'hex');
   meta=jsonb_build_object('version',coalesce(f.published_version,0),'publishedAt',v.published_at,
    'sourceChanged',v.version is not null and source_hash<>v.source_hash,
    'reviewedAt',(select reviewed_at from boat_control.brief_reviews where reservation_id=rid and version=f.published_version and user_id=u.id));
   if u.admin then
    item=row_data||source||jsonb_build_object('brief',meta||jsonb_build_object('revision',coalesce(f.revision,0),'sourceHash',source_hash,'draft',coalesce(f.draft,'{}'),'reviews',reviews,
     'draftChanged',v.version is not null and coalesce(f.draft,'{}')<>coalesce(v.snapshot->'details','{}')));
   else
    item=v.snapshot||jsonb_build_object('brief',meta,'collection',row_data->'collection','reports',row_data->'reports');
    if r not in ('capitan','encargado') then item=item-'phone'-'email'; end if;
   end if;
   result=result||jsonb_build_array(item);
  end loop;
  return result;
 end if;
 if operation not in ('brief_save','brief_publish','brief_review') then raise exception 'Operación desconocida'; end if;
 if (operation in ('brief_save','brief_publish') and not u.admin) or (operation='brief_review' and r not in ('capitan','chef','marinero','encargado')) then raise exception 'Sin permiso para esta acción' using errcode='42501'; end if;
 rid=(payload->>'id')::uuid; key_id=(payload->>'key')::uuid;
 if rid is null or key_id is null then raise exception 'Falta identificador'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id||key_id::text,0));
 select request,rr.result into old_request,receipt from boat_control.operation_receipts rr where user_id=u.id and key=key_id;
 if found then
  if old_request<>((payload-'session')||jsonb_build_object('operation',operation)) then raise exception 'Identificador reutilizado con otros datos'; end if;
  return receipt;
 end if;
 -- The reservation lock serializes publication and review with CRM status edits.
 perform 1 from public.reservations where id=rid for update;
 if not boat_control.crm_reservation_matches(rid,b) then raise exception 'La reserva no está asignada al Nomade en el CRM' using errcode='42501'; end if;
 insert into boat_control.reservation_briefs(reservation_id,boat_id) values(rid,b) on conflict do nothing;
 select * into f from boat_control.reservation_briefs where reservation_id=rid for update;
 if f.boat_id<>b then raise exception 'Sin acceso a esta ficha' using errcode='42501'; end if;
 source=boat_control.brief_source(rid); source_hash=encode(extensions.digest((source-'status')::text,'sha256'),'hex');
 if operation='brief_save' then
  if (payload->>'revision')::integer is distinct from f.revision then raise exception 'La ficha cambió. Actualizá antes de guardar'; end if;
  fields=payload->'details';
  if jsonb_typeof(fields) is distinct from 'object' then raise exception 'Ficha inválida'; end if;
  for k in select jsonb_object_keys(fields) loop
   if k not in ('embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests') or jsonb_typeof(fields->k)<>'string' or length(fields->>k)>2000 then raise exception 'Campo de ficha inválido'; end if;
  end loop;
  update boat_control.reservation_briefs set draft=fields,revision=revision+1,updated_by=u.id,updated_at=now() where reservation_id=rid;
  result=jsonb_build_object('ok',true,'revision',f.revision+1);
 elsif operation='brief_publish' then
  if (payload->>'revision')::integer is distinct from f.revision or payload->>'sourceHash' is distinct from source_hash then raise exception 'La ficha o el CRM cambiaron. Actualizá y revisá antes de publicar'; end if;
  if coalesce(source->>'status','') not in ('confirmed','in_progress') then raise exception 'Confirmá la reserva en el CRM antes de publicar'; end if;
  select * into v from boat_control.brief_versions where reservation_id=rid and version=f.published_version;
  item=source||jsonb_build_object('details',f.draft);
  if v.snapshot is not distinct from item then
   result=jsonb_build_object('ok',true,'version',v.version,'unchanged',true);
  else
   insert into boat_control.brief_versions(reservation_id,version,snapshot,source_hash,published_by) values(rid,f.published_version+1,item,source_hash,u.id);
   update boat_control.reservation_briefs set published_version=published_version+1,revision=revision+1,updated_by=u.id,updated_at=now() where reservation_id=rid;
   insert into boat_control.events(boat_id,actor_id,kind,detail) values(b,u.id,'brief_published',jsonb_build_object('reservationId',rid,'version',f.published_version+1,'start',source->>'start')) returning id into ev_id;
   insert into boat_control.notifications(event_id,user_id) select ev_id,a.id from boat_control.accounts a where a.admin or exists(select 1 from boat_control.members m where m.boat_id=b and m.user_id=a.id and m.role in ('capitan','chef','marinero','encargado'));
   insert into boat_control.push_jobs(notification_id,subscription_id) select n.id,s.id from boat_control.notifications n join boat_control.push_subscriptions s on s.user_id=n.user_id and s.active where n.event_id=ev_id;
   result=jsonb_build_object('ok',true,'version',f.published_version+1);
  end if;
 else
  select * into v from boat_control.brief_versions where reservation_id=rid and version=f.published_version;
  if v.version is null or (payload->>'version')::integer is distinct from f.published_version or source_hash is distinct from v.source_hash or coalesce(source->>'status','') not in ('confirmed','in_progress') then raise exception 'La ficha cambió o requiere una nueva publicación. Actualizá antes de confirmar'; end if;
  insert into boat_control.brief_reviews(reservation_id,version,user_id,role) values(rid,v.version,u.id,r) on conflict do nothing;
  result=jsonb_build_object('ok',true,'version',v.version);
 end if;
 insert into boat_control.operation_receipts(user_id,key,request,result) values(u.id,key_id,(payload-'session')||jsonb_build_object('operation',operation),result);
 return result;
end $$;
