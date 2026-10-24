-- Carlota's compact guest card: two explicit, approved fields; no internal CRM notes in crew payloads.
-- Existing approval guards, permissions, source hashes and immutable publications are preserved.
CREATE OR REPLACE FUNCTION public.crm_nomade_brief(p_opportunity_id uuid, p_operation text DEFAULT 'read'::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid=auth.uid(); rid uuid; b text; f boat_control.reservation_briefs%rowtype;
 a boat_control.crm_brief_approvals%rowtype; src jsonb; sh text; ah text; fields jsonb; k text;
 can_approve boolean; automation boolean; valid boolean; ev bigint; result jsonb; ver integer;
begin
 if uid is null or not private.is_active_crm_user() or not private.crm_user_sees_all_records() then
  raise exception 'Sin acceso a la ficha' using errcode='42501';
 end if;
 select r.id into rid from public.reservations r join public.opportunities o on o.id=r.opportunity_id where o.id=p_opportunity_id and not o.is_archived;
 if rid is null then raise exception 'Reserva no disponible' using errcode='P0002'; end if;
 if p_operation not in ('read','save','approve','revoke','publish') then raise exception 'Acción inválida'; end if;
 -- The same ordering as the boat app prevents publication/save/review races.
 if p_operation<>'read' then perform 1 from public.reservations where id=rid for update; end if;
 select l.boat_id into b from boat_control.crm_boat_links l where boat_control.is_nomade(l.boat_id) and boat_control.crm_reservation_matches(rid,l.boat_id);
 if b is null then
  if p_operation='read' then return jsonb_build_object('eligible',false); end if;
  raise exception 'La reserva debe estar asignada al Nomade en el CRM';
 end if;
 automation=private.is_crm_automation_account(uid);
 can_approve=not automation and exists(select 1 from boat_control.crm_brief_approvers where user_id=uid);
 if p_operation in ('save','approve','revoke') and automation then raise exception 'Carlota debe revisar la ficha en el CRM' using errcode='42501'; end if;
 if p_operation in ('approve','revoke') and not can_approve then raise exception 'Solo la persona revisora autorizada puede aprobar o retirar la aprobación' using errcode='42501'; end if;
 if p_operation<>'read' then insert into boat_control.reservation_briefs(reservation_id,boat_id) values(rid,b) on conflict do nothing; end if;
 select * into f from boat_control.reservation_briefs where reservation_id=rid;
 src=boat_control.brief_source(rid);
 sh=encode(extensions.digest((src-'status')::text,'sha256'),'hex'); ah=boat_control.brief_audience_hash(b);
 if p_operation in ('save','approve') and ((p_payload->>'revision')::integer is distinct from coalesce(f.revision,0) or p_payload->>'sourceHash' is distinct from sh or p_payload->>'audienceHash' is distinct from ah) then
  raise exception 'La ficha o la tripulación cambiaron. Actualizá y revisá nuevamente';
 end if;
 if p_operation='save' then
  fields=p_payload->'details';
  if jsonb_typeof(fields) is distinct from 'object' then raise exception 'Ficha inválida'; end if;
  for k in select jsonb_object_keys(fields) loop
   if k not in ('embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests','country','airConditioning') or jsonb_typeof(fields->k)<>'string' or length(fields->>k)>2000 then raise exception 'Campo de ficha inválido'; end if;
  end loop;
  update boat_control.reservation_briefs set draft=fields,revision=revision+1,updated_at=now() where reservation_id=rid;
  update boat_control.crm_brief_approvals set revoked_at=now() where reservation_id=rid and revoked_at is null and published_version is null;
  insert into boat_control.crm_brief_history(reservation_id,action,actor_id) values(rid,'saved',uid);
 elsif p_operation='approve' then
  if coalesce(src->>'status','') not in ('confirmed','in_progress') then raise exception 'Confirmá la reserva antes de aprobar la publicación'; end if;
  if not exists(select 1 from boat_control.members where boat_id=b and role='capitan') then raise exception 'Falta el capitán en la tripulación del Nomade'; end if;
  -- Repeated approval of unchanged content is harmless and keeps the same receipt.
  select * into a from boat_control.crm_brief_approvals where reservation_id=rid and revoked_at is null and published_version is null;
  if (a.id is null or a.revision<>f.revision or a.source_hash<>sh or a.audience_hash<>ah)
  and not exists(select 1 from boat_control.brief_versions v join boat_control.crm_brief_approvals old_a on old_a.id=v.crm_approval_id where v.reservation_id=rid and v.version=f.published_version and old_a.audience_hash=ah and v.snapshot-'status'=(src||jsonb_build_object('details',f.draft))-'status') then
   update boat_control.crm_brief_approvals set revoked_at=now() where reservation_id=rid and revoked_at is null and published_version is null;
   insert into boat_control.crm_brief_approvals(reservation_id,boat_id,revision,source_hash,audience_hash,snapshot,approved_by)
    values(rid,b,f.revision,sh,ah,src||jsonb_build_object('details',f.draft),uid) returning * into a;
   insert into boat_control.crm_brief_history(reservation_id,action,actor_id,approval_id) values(rid,'approved',uid,a.id);
  end if;
 elsif p_operation='revoke' then
  update boat_control.crm_brief_approvals set revoked_at=now() where id=(p_payload->>'approvalId')::uuid and reservation_id=rid and revoked_at is null and published_version is null returning * into a;
  if found then insert into boat_control.crm_brief_history(reservation_id,action,actor_id,approval_id) values(rid,'revoked',uid,a.id); end if;
 elsif p_operation='publish' then
  select * into a from boat_control.crm_brief_approvals where id=(p_payload->>'approvalId')::uuid and reservation_id=rid for update;
  if a.id is null then raise exception 'Falta la aprobación de Carlota'; end if;
  if a.published_version is not null then return jsonb_build_object('ok',true,'version',a.published_version,'unchanged',true); end if;
  -- The trigger revalidates source, scope, approver, revision and audience atomically.
  ver=f.published_version+1;
  insert into boat_control.brief_versions(reservation_id,version,snapshot,source_hash,crm_approval_id) values(rid,ver,a.snapshot,sh,a.id);
  update boat_control.reservation_briefs set published_version=ver,revision=revision+1,updated_at=now() where reservation_id=rid;
  update boat_control.crm_brief_approvals set published_version=ver,published_at=now(),published_by=uid where id=a.id;
  insert into boat_control.crm_brief_history(reservation_id,action,actor_id,approval_id) values(rid,'published',uid,a.id);
  insert into boat_control.events(boat_id,kind,detail) values(b,'brief_published',jsonb_build_object('reservationId',rid,'version',ver,'start',src->>'start','crmApprovalId',a.id)) returning id into ev;
  insert into boat_control.notifications(event_id,user_id) select ev,ac.id from boat_control.accounts ac where ac.admin or exists(select 1 from boat_control.members m where m.boat_id=b and m.user_id=ac.id and m.role in ('capitan','chef','marinero','encargado'));
  insert into boat_control.push_jobs(notification_id,subscription_id) select n.id,s.id from boat_control.notifications n join boat_control.push_subscriptions s on s.user_id=n.user_id and s.active where n.event_id=ev;
  return jsonb_build_object('ok',true,'version',ver,'unchanged',false);
 end if;
 select * into f from boat_control.reservation_briefs where reservation_id=rid;
 select * into a from boat_control.crm_brief_approvals where reservation_id=rid order by approved_at desc,id desc limit 1;
 valid=a.id is not null and a.revoked_at is null and a.published_version is null and a.revision=f.revision and a.source_hash=sh and a.audience_hash=ah;
 result=jsonb_build_object('eligible',true,'reservationId',rid,'source',src,'sourceHash',sh,'audienceHash',ah,'details',coalesce(f.draft,'{}'),'revision',coalesce(f.revision,0),'version',coalesce(f.published_version,0),'canApprove',can_approve,'canEdit',not automation,
 'approval',case when a.id is null then null else jsonb_build_object('id',a.id,'valid',coalesce(valid,false),'approvedAt',a.approved_at,'approvedBy',(select display_name from public.crm_profiles where user_id=a.approved_by),'publishedAt',a.published_at,'publishedVersion',a.published_version,'revokedAt',a.revoked_at) end,
 'sourceChanged',exists(select 1 from boat_control.brief_versions v left join boat_control.crm_brief_approvals old_a on old_a.id=v.crm_approval_id where v.reservation_id=rid and v.version=f.published_version and (v.source_hash<>sh or v.snapshot->'details' is distinct from f.draft or old_a.audience_hash is distinct from ah)),
 'crew',(select coalesce(jsonb_agg(jsonb_build_object('name',ac.name,'role',m.role,'reviewedAt',rv.reviewed_at) order by m.role,ac.name),'[]') from boat_control.members m join boat_control.accounts ac on ac.id=m.user_id left join boat_control.brief_reviews rv on rv.reservation_id=rid and rv.version=f.published_version and rv.user_id=ac.id where m.boat_id=b and m.role in ('capitan','chef','marinero','encargado')),
 'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.at desc),'[]') from (select x.action,x.created_at as at,p.display_name as actor from boat_control.crm_brief_history x join public.crm_profiles p on p.user_id=x.actor_id where x.reservation_id=rid order by x.created_at desc limit 20)h));
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION boat_control.briefs(server_key text, operation text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    item=(v.snapshot-'notes')||jsonb_build_object('brief',meta,'collection',row_data->'collection','reports',row_data->'reports');
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
   if k not in ('embarkation','embarkationTime','disembarkation','disembarkationTime','food','allergies','drinks','activities','transport','requests','country','airConditioning') or jsonb_typeof(fields->k)<>'string' or length(fields->>k)>2000 then raise exception 'Campo de ficha inválido'; end if;
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
end $function$
;
