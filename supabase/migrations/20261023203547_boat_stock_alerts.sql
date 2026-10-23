create or replace function boat_control.emit_event(b text, actor text, event_kind text, detail jsonb default '{}') returns void language plpgsql set search_path='' as $$
declare e bigint; begin
 insert into boat_control.events(boat_id,actor_id,kind,detail) values(b,actor,event_kind,detail) returning id into e;
 insert into boat_control.notifications(event_id,user_id)
 select e,a.id from boat_control.accounts a where a.id=actor or a.admin or exists(
  select 1 from boat_control.members m where m.boat_id=b and m.user_id=a.id and (
   m.role in ('capitan','encargado') or (event_kind in ('stock_minimo','stock_agotado') and m.role in ('chef','marinero')) or (event_kind='tareas_por_atender' and m.role<>'lector' and exists(
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

create or replace function boat_control.operations(server_key text, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u boat_control.accounts%rowtype; b text=payload->>'boat'; r text; manager boolean; result jsonb; old_request jsonb; key_id uuid;
 q boat_control.requests%rowtype; tr boat_control.transfers%rowtype; link boat_control.reservation_links%rowtype; ins boat_control.collection_instructions%rowtype;
 p jsonb; qty numeric; n numeric; rid uuid; target text; begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 r=case when u.admin then 'administrador' else (select role from boat_control.members where boat_id=b and user_id=u.id) end;
 if r is null or not exists(select 1 from boat_control.boats where id=b) then raise exception 'Sin acceso al barco' using errcode='42501'; end if;
 manager=u.admin or r='encargado';
 if operation='reservations' then perform boat_control.sync_crm_reservations(b); end if;
 if operation in ('collection_instruction','collection_report','reservation_preferences') and exists(select 1 from boat_control.reservation_links l where l.reservation_id=(payload->>'id')::uuid and l.boat_id=b and l.auto_link and not boat_control.crm_reservation_matches(l.reservation_id,b)) then raise exception 'La asignación del barco cambió en el CRM. Revisá la reserva con administración'; end if;
 if operation='overview' then
  return jsonb_build_object(
   'requests',(select coalesce(jsonb_agg(to_jsonb(rq) order by rq.created_at desc),'[]') from boat_control.requests rq where rq.boat_id=b),
   'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from boat_control.transfers t where t.source_id=b or t.target_id=b),
   'fleet',(select coalesce(jsonb_agg(jsonb_build_object('id',bb.id,'name',bb.name,'products',bb.state->'products')),'[]') from boat_control.boats bb where u.admin or exists(select 1 from boat_control.members m where m.boat_id=bb.id and m.user_id=u.id)),
   'notifications',(select coalesce(jsonb_agg(z order by z.id desc),'[]') from (select nn.id,nn.read_at,e.kind,e.detail,e.created_at,e.boat_id from boat_control.notifications nn join boat_control.events e on e.id=nn.event_id where nn.user_id=u.id and e.boat_id=b order by nn.id desc limit 100) z),
   'members',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'role',m.role)),'[]') from boat_control.members m join boat_control.accounts a on a.id=m.user_id where m.boat_id=b));
 elsif operation='reservations' then
  return (select coalesce(jsonb_agg(jsonb_build_object('id',rr.id,'status',rr.charter_status,'start',o.desired_start_date,'end',o.desired_end_date,'guests',o.passenger_count,'name',c.full_name,'notes',rr.operational_notes,'preferences',l.preferences,'captainId',l.captain_id,'passengers',(select coalesce(jsonb_agg(jsonb_build_object('name',pp.full_name,'food',pp.dietary_restriction,'avoid',pp.foods_to_avoid,'requests',pp.special_requests) order by pp.position),'[]') from public.opportunity_passengers pp where pp.opportunity_id=o.id),'interests',o.interests,'crmBalance',case when u.admin then (case when o.final_sale_amount is not null and coalesce(o.deposit_amount,o.commission_amount) is not null then greatest(0,round(o.final_sale_amount-coalesce(o.deposit_amount,o.commission_amount),2)) else o.remaining_balance_amount end) else null end,'currency',case when u.admin then o.budget_currency else null end,
   'collection',case when u.admin or (r='capitan' and l.captain_id=u.id) then (select to_jsonb(ci) from boat_control.collection_instructions ci where ci.reservation_id=rr.id) else null end,
   'reports',case when u.admin or (r='capitan' and l.captain_id=u.id) then (select coalesce(jsonb_agg(to_jsonb(cc)),'[]') from boat_control.collections cc where cc.reservation_id=rr.id) else '[]'::jsonb end) order by o.desired_start_date),'[]')
   from boat_control.reservation_links l join public.reservations rr on rr.id=l.reservation_id join public.opportunities o on o.id=rr.opportunity_id left join public.contacts c on c.id=o.contact_id where l.boat_id=b and not o.is_archived and (not l.auto_link or boat_control.crm_reservation_matches(l.reservation_id,b)));
 elsif operation='reservation_candidates' then
  if not u.admin then raise exception 'Solo administración' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(z),'[]') from (select rr.id,c.full_name as name,o.desired_start_date as start,o.desired_end_date as "end",rr.charter_status as status from public.reservations rr join public.opportunities o on o.id=rr.opportunity_id left join public.contacts c on c.id=o.contact_id where not o.is_archived and not exists(select 1 from boat_control.reservation_links l where l.reservation_id=rr.id) order by o.desired_start_date desc limit 100) z);
 end if;
 if r='lector' then raise exception 'Solo lectura' using errcode='42501'; end if;
 key_id=(payload->>'key')::uuid;
 if key_id is null then raise exception 'Falta identificador de operación'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id||key_id::text,0));
 select request,receipt.result into old_request,result from boat_control.operation_receipts receipt where user_id=u.id and key=key_id;
 if found then
  if old_request<>((payload-'session')||jsonb_build_object('operation',operation)) then raise exception 'Identificador reutilizado con otros datos'; end if;
  return result;
 end if;
 result=jsonb_build_object('ok',true);
 if operation='request_create' then
  if payload->>'area' not in ('tecnica','gastronomia') or length(trim(payload->>'name')) not between 1 and 140 or length(trim(payload->>'unit')) not between 1 and 20 then raise exception 'Completá área, nombre y unidad'; end if;
  insert into boat_control.requests(boat_id,area,name,unit,quantity,urgent,notes,photo,created_by)
   values(b,payload->>'area',trim(payload->>'name'),trim(payload->>'unit'),(payload->>'quantity')::numeric,coalesce((payload->>'urgent')::boolean,false),coalesce(payload->>'notes',''),coalesce(payload->>'photo',''),u.id) returning id into rid;
  result=jsonb_build_object('ok',true,'id',rid);
 elsif operation in ('request_status','request_receive') then
  select * into q from boat_control.requests where id=(payload->>'id')::uuid and boat_id=b for update;
  if q.id is null then raise exception 'Pedido inexistente'; end if;
  if operation='request_status' then
   if payload->>'status'='solicitado' and q.status='borrador' and (manager or q.created_by=u.id) then null;
   elsif not manager then raise exception 'Solo administración puede aprobar compras' using errcode='42501';
   elsif not ((q.status='solicitado' and payload->>'status'='aprobado') or (q.status='aprobado' and payload->>'status'='comprado') or (q.received=0 and q.status not in ('recibido','cancelado') and payload->>'status'='cancelado')) then raise exception 'Cambio de estado inválido'; end if;
   update boat_control.requests set status=payload->>'status',updated_at=now() where id=q.id;
  else
   if not manager and r<>'capitan' then raise exception 'Solo responsable de recepción' using errcode='42501'; end if;
   qty=(payload->>'quantity')::numeric;
   if q.status<>'comprado' or qty<=0 or qty>q.quantity-q.received then raise exception 'Cantidad o estado de recepción inválido'; end if;
   p=jsonb_build_object('id',payload->>'productId','name',q.name,'unit',q.unit,'area',q.area,'location',payload->>'location');
   perform boat_control.stock_delta(b,p,qty,u.id,'Recepción de pedido '||q.id::text);
   update boat_control.requests set received=received+qty,status=case when received+qty=quantity then 'recibido' else status end,updated_at=now() where id=q.id;
  end if;
 elsif operation='stock_add' then
  if not manager then raise exception 'Solo administración puede cargar existencias iniciales' using errcode='42501'; end if;
  qty=(payload->>'quantity')::numeric;
  if qty<0 or length(trim(payload->>'name')) not between 1 and 140 or payload->>'area' not in ('tecnica','gastronomia') or length(trim(payload->>'unit')) not between 1 and 20 or length(trim(payload->>'location')) not between 1 and 140 then raise exception 'Completá los datos del insumo'; end if;
  result=boat_control.stock_delta(b,payload,qty,u.id,'Inventario contado: '||coalesce(payload->>'note','Carga inicial'));
 elsif operation='stock_consume' then
  qty=(payload->>'quantity')::numeric;
  if qty<=0 or length(trim(payload->>'note'))<3 then raise exception 'Indicá cantidad y motivo'; end if;
  select x into p from boat_control.boats bb cross join lateral jsonb_array_elements(bb.state->'products') x where bb.id=b and x->>'id'=payload->>'productId';
  if p is null then raise exception 'Insumo inexistente'; end if;
  result=boat_control.stock_delta(b,p,-qty,u.id,payload->>'note');
 elsif operation='transfer_send' then
  target=payload->>'target'; qty=(payload->>'quantity')::numeric;
  if qty<=0 or target=b or not exists(select 1 from boat_control.boats bb where bb.id=target and (u.admin or exists(select 1 from boat_control.members m where m.boat_id=target and m.user_id=u.id and m.role<>'lector'))) then raise exception 'Destino o cantidad inválidos'; end if;
  if not manager and r not in ('capitan','chef') then raise exception 'Sin permiso para transferir' using errcode='42501'; end if;
  perform 1 from boat_control.boats where id in(b,target) order by id for update;
  select x into p from boat_control.boats bb cross join lateral jsonb_array_elements(bb.state->'products') x where bb.id=b and x->>'id'=payload->>'productId';
  if p is null then raise exception 'Insumo inexistente'; end if;
  perform boat_control.stock_delta(b,p,-qty,u.id,'Transferencia a '||(select name from boat_control.boats where id=target));
  insert into boat_control.transfers(source_id,target_id,product,quantity,created_by) values(b,target,p,qty,u.id) returning id into rid;
  perform boat_control.emit_event(target,u.id,'transferencia_pendiente',jsonb_build_object('id',rid));
 elsif operation in ('transfer_receive','transfer_cancel') then
  select * into tr from boat_control.transfers where id=(payload->>'id')::uuid and (source_id=b or target_id=b) for update;
  if tr.id is null or tr.status<>'en_transito' then raise exception 'Transferencia no disponible'; end if;
  if not manager and r not in ('capitan','chef') then raise exception 'Sin permiso para transferir' using errcode='42501'; end if;
  perform 1 from boat_control.boats where id in(tr.source_id,tr.target_id) order by id for update;
  if operation='transfer_cancel' then
   if b<>tr.source_id or tr.received<>0 then raise exception 'Solo origen puede cancelar antes de recibir'; end if;
   perform boat_control.stock_delta(b,tr.product,tr.quantity,u.id,'Cancelación de transferencia '||tr.id::text);
   update boat_control.transfers set status='cancelado' where id=tr.id;
  else
   qty=(payload->>'quantity')::numeric;
   if b<>tr.target_id or qty<=0 or qty>tr.quantity-tr.received then raise exception 'Destino o cantidad de recepción inválidos'; end if;
   p=tr.product||jsonb_build_object('id',payload->>'productId','location',payload->>'location');
   perform boat_control.stock_delta(b,p,qty,u.id,'Recepción de transferencia '||tr.id::text);
   update boat_control.transfers set received=received+qty,status=case when received+qty=quantity then 'recibido' else status end where id=tr.id;
  end if;
 elsif operation='reservation_link' then
  if not u.admin then raise exception 'Solo administración' using errcode='42501'; end if;
  insert into boat_control.reservation_links(reservation_id,boat_id) values((payload->>'id')::uuid,b);
 elsif operation='reservation_preferences' then
  if not u.admin then raise exception 'Solo administración' using errcode='42501'; end if;
  if nullif(payload->>'captainId','') is not null and not exists(select 1 from boat_control.members where boat_id=b and user_id=payload->>'captainId' and role='capitan') then raise exception 'Seleccioná un capitán asignado al barco'; end if;
  update boat_control.reservation_links set preferences=payload->'preferences',captain_id=nullif(payload->>'captainId',''),updated_at=now() where reservation_id=(payload->>'id')::uuid and boat_id=b;
  if not found then raise exception 'Reserva inexistente'; end if;
 elsif operation='collection_instruction' then
  if not u.admin or payload->>'verified'<>'true' then raise exception 'Administración debe verificar el importe' using errcode='42501'; end if;
  perform 1 from boat_control.reservation_links where reservation_id=(payload->>'id')::uuid and boat_id=b for update;
  if not found then raise exception 'Reserva inexistente'; end if;
  if exists(select 1 from boat_control.collections where reservation_id=(payload->>'id')::uuid and status<>'rechazado') then raise exception 'Revisá los cobros existentes antes de cambiar la instrucción'; end if;
  insert into boat_control.collection_instructions(reservation_id,amount,currency,concept,due_date,verified_by) values((payload->>'id')::uuid,(payload->>'amount')::numeric,payload->>'currency',payload->>'concept',(payload->>'dueDate')::date,u.id)
  on conflict(reservation_id) do update set amount=excluded.amount,currency=excluded.currency,concept=excluded.concept,due_date=excluded.due_date,verified_by=u.id,verified_at=now(),valid=true;
 elsif operation='collection_report' then
  select * into link from boat_control.reservation_links where reservation_id=(payload->>'id')::uuid and boat_id=b for update;
  if link.reservation_id is null or not (u.admin or (r='capitan' and link.captain_id=u.id)) then raise exception 'Solo capitán asignado o administración' using errcode='42501'; end if;
  select * into ins from boat_control.collection_instructions where reservation_id=link.reservation_id;
  qty=(payload->>'amount')::numeric;
  select coalesce(sum(amount),0) into n from boat_control.collections where reservation_id=link.reservation_id and status<>'rechazado';
  if ins.reservation_id is null or not ins.valid or qty<=0 or qty>ins.amount-n then raise exception 'Importe excede el pendiente'; end if;
  insert into boat_control.collections(reservation_id,amount,currency,note,created_by) values(link.reservation_id,qty,ins.currency,coalesce(payload->>'note',''),u.id);
 elsif operation='collection_review' then
  if not u.admin or payload->>'status' not in ('confirmado','rechazado') then raise exception 'Solo administración' using errcode='42501'; end if;
  update boat_control.collections cc set status=payload->>'status',confirmed_by=u.id,confirmed_at=now() from boat_control.reservation_links l where cc.id=(payload->>'id')::uuid and cc.reservation_id=l.reservation_id and l.boat_id=b and cc.status='informado';
  if not found then raise exception 'El cobro ya fue revisado o no existe'; end if;
 elsif operation='notification_read' then
  update boat_control.notifications nn set read_at=now() from boat_control.events e where nn.id=(payload->>'id')::bigint and nn.user_id=u.id and e.id=nn.event_id and e.boat_id=b;
 elsif operation='push_subscribe' then
  if length(payload->'subscription'->>'endpoint')>2000 then raise exception 'Suscripción inválida'; end if;
  insert into boat_control.push_subscriptions(user_id,endpoint,subscription) values(u.id,payload->'subscription'->>'endpoint',payload->'subscription') on conflict(endpoint) do update set user_id=u.id,subscription=excluded.subscription,active=true;
 elsif operation='push_unsubscribe' then
  update boat_control.push_subscriptions set active=false where user_id=u.id and endpoint=payload->>'endpoint';
 elsif operation='push_test' then null;
 else raise exception 'Operación desconocida';
 end if;
 if operation not in ('notification_read','push_subscribe','push_unsubscribe') then perform boat_control.emit_event(b,u.id,operation,jsonb_build_object('id',coalesce(rid::text,payload->>'id'))); end if;
 insert into boat_control.operation_receipts values(u.id,key_id,(payload-'session')||jsonb_build_object('operation',operation),result,now());
 return result;
end $$;
create or replace function boat_control.push_worker(server_key text, operation text, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 if operation='claim' then
  -- Access revocation prevents any further private notifications.
  update boat_control.push_jobs j set status='expired' from boat_control.notifications n join boat_control.events e on e.id=n.event_id join boat_control.accounts a on a.id=n.user_id
   where j.notification_id=n.id and j.status in ('pending','retry','sending') and not a.admin and not exists(select 1 from boat_control.members m where m.user_id=a.id and m.boat_id=e.boat_id and m.role<>'lector');
  -- Do not deliver a delayed shortage after replenishment or a newer alert.
  update boat_control.push_jobs j set status='superseded'
   from boat_control.notifications n join boat_control.events e on e.id=n.event_id join boat_control.boats b on b.id=e.boat_id
   where j.notification_id=n.id and j.status in ('pending','retry') and e.kind in ('stock_minimo','stock_agotado') and (
    not exists(select 1 from jsonb_array_elements(b.state->'products') p where p->>'id'=e.detail->>'productId' and boat_control.stock_alert_level(p)>0)
    or exists(select 1 from boat_control.events later where later.boat_id=e.boat_id and later.id>e.id and later.kind in ('stock_minimo','stock_agotado') and later.detail->>'productId'=e.detail->>'productId'));
  with picked as (select j.id from boat_control.push_jobs j join boat_control.push_subscriptions s on s.id=j.subscription_id and s.active where j.attempts<8 and ((j.status in ('pending','retry') and j.next_attempt<=now()) or (j.status='sending' and j.lease_until<now())) order by j.id for update of j skip locked limit least(coalesce((payload->>'limit')::int,10),20)), claimed as (
   update boat_control.push_jobs j set status='sending',attempts=attempts+1,lease_until=now()+interval '60 seconds' from picked where j.id=picked.id returning j.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'notification_id',j.notification_id,'lease_until',j.lease_until,'subscription',s.subscription,'kind',e.kind,'detail',e.detail,'boat_id',e.boat_id)),'[]') into result from claimed j join boat_control.push_subscriptions s on s.id=j.subscription_id join boat_control.notifications n on n.id=j.notification_id join boat_control.events e on e.id=n.event_id;
  return result;
 elsif operation='finish' then
  update boat_control.push_jobs set status=case when payload->>'status'='retry' and attempts>=8 then 'failed' else payload->>'status' end,next_attempt=now()+least(attempts*attempts,60)*interval '1 minute',last_error=payload->>'error' where id=(payload->>'id')::bigint and status='sending' and lease_until=(payload->>'lease')::timestamptz;
  if payload->>'status'='expired' then update boat_control.push_subscriptions set active=false where id=(select subscription_id from boat_control.push_jobs where id=(payload->>'id')::bigint and status='expired'); end if;
  return '{"ok":true}';
 end if;
 raise exception 'Operación desconocida';
end $$;


-- Runs in the stock transaction, including counts, purchases, work materials,
-- transfers and restores. An unchanged shortage never produces another event.
create function boat_control.stock_alert_level(product jsonb) returns integer
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(product->'current')<>'number' then 0
 when (product->>'current')::numeric=0 then 2
 when (product->>'current')::numeric>0 and coalesce((product->>'min')::numeric,0)>0
 and (product->>'current')::numeric<=(product->>'min')::numeric then 1 else 0 end
$$;
revoke all on function boat_control.stock_alert_level(jsonb) from public,anon,authenticated;

create function boat_control.stock_alerts_changed() returns trigger
language plpgsql set search_path='' as $$
declare previous_products jsonb; product jsonb; previous jsonb; severity integer; previous_severity integer;
begin
 previous_products=case when TG_OP='UPDATE' then coalesce(OLD.state->'products','[]') else '[]'::jsonb end;
 if previous_products=coalesce(NEW.state->'products','[]') then return NEW;end if;
 for product in select value from jsonb_array_elements(coalesce(NEW.state->'products','[]')) loop
  severity=boat_control.stock_alert_level(product);
  if severity=0 then continue;end if;
  select value into previous from jsonb_array_elements(previous_products) where value->>'id'=product->>'id' limit 1;
  previous_severity=boat_control.stock_alert_level(previous);
  if severity>previous_severity then
   perform boat_control.emit_event(NEW.id,null,case when severity=2 then 'stock_agotado' else 'stock_minimo' end,
    jsonb_build_object('productId',product->>'id','name',product->>'name','unit',product->>'unit',
     'current',product->'current','min',product->'min','location',product->>'location','revision',NEW.revision));
  end if;
 end loop;
 return NEW;
end $$;
revoke all on function boat_control.stock_alerts_changed() from public,anon,authenticated;
create trigger boat_stock_alerts after insert or update of state on boat_control.boats
for each row execute function boat_control.stock_alerts_changed();
