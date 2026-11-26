create table boat_control.stockroom_packages (
 id uuid primary key default gen_random_uuid(), boat_id text not null references boat_control.boats(id),
 sent_by text not null references boat_control.accounts(id), sent_at timestamptz not null default now(),
 sent_photo uuid not null references boat_control.photos(id), items jsonb not null,
 status text not null default 'in_transit' check (status in ('in_transit','partial','received'))
);
create index stockroom_packages_boat_recent on boat_control.stockroom_packages(boat_id,sent_at desc);
create table boat_control.stockroom_package_receipts (
 id uuid primary key default gen_random_uuid(), package_id uuid not null references boat_control.stockroom_packages(id),
 received_by text not null references boat_control.accounts(id), received_at timestamptz not null default now(),
 photo_id uuid not null references boat_control.photos(id), items jsonb not null, note text not null default ''
);
create index stockroom_package_receipts_package on boat_control.stockroom_package_receipts(package_id,received_at);
alter table boat_control.stockroom_packages enable row level security;
alter table boat_control.stockroom_package_receipts enable row level security;
revoke all on boat_control.stockroom_packages,boat_control.stockroom_package_receipts from public,anon,authenticated;

create function boat_control.stockroom_package_notify(b text,who text,kind text,detail jsonb) returns void
language plpgsql set search_path='' as $$
declare v_event_id bigint;
begin
 insert into boat_control.events(boat_id,actor_id,kind,detail) values(b,who,kind,detail) returning id into v_event_id;
 insert into boat_control.notifications(event_id,user_id)
 select v_event_id,a.id from boat_control.accounts a where a.admin or (kind='package_dispatched' and exists(
   select 1 from boat_control.members m where m.boat_id=b and m.user_id=a.id and m.role in ('capitan','chef','marinero','encargado')));
 insert into boat_control.push_jobs(notification_id,subscription_id)
 select n.id,s.id from boat_control.notifications n join boat_control.push_subscriptions s on s.user_id=n.user_id and s.active where n.event_id=v_event_id;
end $$;
revoke all on function boat_control.stockroom_package_notify(text,text,text,jsonb) from public,anon,authenticated;

create function boat_control.stockroom_package(server_key text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor boat_control.accounts%rowtype; depot boat_control.stockroom%rowtype; ship boat_control.stockroom_packages%rowtype;
 prior boat_control.operation_receipts%rowtype; vessel boat_control.boats%rowtype;
 b text=payload->>'boat'; member_role text; request jsonb; answer jsonb; k uuid; attachment uuid; ship_id uuid;
 normalized jsonb:='[]'; logs jsonb:='[]'; received_rows jsonb:='[]'; seen text[]:='{}';
 line jsonb; old_line jsonb; p jsonb; target jsonb; row_id text; loc text; note text;
 packs numeric; per_pack numeric; qty numeric; remaining numeric; balance numeric; status_after text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 select name into vessel.name from boat_control.boats where id=b;
 select role into member_role from boat_control.members where boat_id=b and user_id=actor.id;
 if vessel.name is null or (actor.admin is distinct from true and coalesce(member_role,'') not in ('capitan','chef','marinero','encargado')) then
  raise exception 'Sin acceso a los paquetes de este barco.' using errcode='42501';
 end if;
 if operation='warehouse_package_list' then
  return (select coalesce(jsonb_agg(to_jsonb(rows) order by rows.sent_at desc),'[]') from (
    select sp.id,sp.boat_id,sp.sent_at,sp.sent_photo,sp.items,sp.status,coalesce(
      (select jsonb_agg(jsonb_build_object('photo',r.photo_id,'at',r.received_at,'items',r.items,'note',r.note) order by r.received_at) from boat_control.stockroom_package_receipts r where r.package_id=sp.id),'[]') receipts
    from boat_control.stockroom_packages sp where sp.boat_id=b
    order by (sp.status<>'received') desc,sp.sent_at desc limit 100) rows);
 end if;
 if operation='warehouse_package_photo' then
  attachment=(payload->>'photo')::uuid;
  return to_jsonb(exists(select 1 from boat_control.stockroom_packages p where p.boat_id=b and (p.sent_photo=attachment or exists(
    select 1 from boat_control.stockroom_package_receipts r where r.package_id=p.id and r.photo_id=attachment))));
 end if;
 if operation not in ('warehouse_package_send','warehouse_package_receive') then raise exception 'Operación desconocida' using errcode='22023'; end if;
 if operation='warehouse_package_send' and actor.admin is distinct from true then raise exception 'Solo Administración despacha desde Tierra.' using errcode='42501'; end if;
 k=(payload->>'key')::uuid; attachment=(payload->>'photo')::uuid;
 if k is null or not exists(select 1 from boat_control.photos where id=attachment and boat_id=b) then
  raise exception 'Adjuntá una foto del paquete correspondiente a este barco.' using errcode='22023';
 end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'No se indicaron productos' using errcode='22023'; end if;
 if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Incluí entre 1 y 50 productos.' using errcode='22023'; end if;
 request=(payload-'session')||jsonb_build_object('operation',operation);
 perform pg_advisory_xact_lock(hashtextextended(actor.id||k::text,0));
 select * into prior from boat_control.operation_receipts where user_id=actor.id and key=k;
 if found then
  if prior.request is distinct from request then raise exception 'Identificador reutilizado.' using errcode='22023'; end if;
  return prior.result;
 end if;
 if operation='warehouse_package_send' then
  ship_id=gen_random_uuid();
  select * into strict depot from boat_control.stockroom where id for update;
  if depot.revision is distinct from (payload->>'revision')::int then raise exception 'Cambió el stock de Tierra. Revisá el paquete.' using errcode='40001'; end if;
  for line in select value from jsonb_array_elements(payload->'items') loop
   row_id=line->>'productId'; packs=(line->>'packs')::numeric; per_pack=(line->>'perPack')::numeric;
   qty=packs*per_pack;
   if row_id is null or row_id=any(seen) or packs is null or packs<=0 or packs<>trunc(packs) or packs>1000000 or
      per_pack is null or per_pack<=0 or per_pack<>round(per_pack,4) or qty>=1e9 then
    raise exception 'Revisá los productos, las fundas y las unidades por funda.' using errcode='22023';
   end if;
   seen=array_append(seen,row_id);
   select x into p from jsonb_array_elements(depot.products) x where x->>'id'=row_id;
   balance=(p->>'current')::numeric-qty;
   if p is null or balance is null or balance<0 then raise exception 'Stock insuficiente en Tierra para %.',coalesce(p->>'name','el producto') using errcode='22023'; end if;
   select jsonb_agg(case when x->>'id'=row_id then x||jsonb_build_object('current',balance) else x end order by n)
    into depot.products from jsonb_array_elements(depot.products) with ordinality entries(x,n);
   normalized=normalized||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',row_id,'name',p->>'name','unit',p->>'unit',
    'area',coalesce(p->>'area','tecnica'),'sent',qty,'received',0,'packs',packs,'perPack',per_pack));
   logs=logs||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'packageId',ship_id,'productId',row_id,'name',p->>'name','unit',p->>'unit',
    'delta',-qty,'balance',balance,'date',(now() at time zone 'America/Panama')::date,'reason','Paquete en camino a '||vessel.name,'responsible',actor.name));
  end loop;
  update boat_control.stockroom set products=depot.products,movements=depot.movements||logs,revision=depot.revision+1 where id;
  insert into boat_control.stockroom_packages(id,boat_id,sent_by,sent_photo,items) values(ship_id,b,actor.id,attachment,normalized);
  perform boat_control.stockroom_package_notify(b,actor.id,'package_dispatched',jsonb_build_object('packageId',ship_id,'boat',vessel.name));
  status_after='in_transit';
 else
  ship_id=(payload->>'id')::uuid;
  select * into ship from boat_control.stockroom_packages where id=ship_id and boat_id=b for update;
  if not found then raise exception 'Paquete inexistente para este barco.' using errcode='42501'; end if;
  if ship.status='received' then raise exception 'El paquete ya fue recibido.' using errcode='40001'; end if;
  if ship.sent_photo=attachment or exists(select 1 from boat_control.stockroom_package_receipts where package_id=ship_id and photo_id=attachment) then
   raise exception 'Adjuntá una foto nueva de lo recibido.' using errcode='22023';
  end if;
  select * into strict vessel from boat_control.boats where id=b for update;
  normalized=ship.items;
  for line in select value from jsonb_array_elements(payload->'items') loop
   row_id=line->>'lineId'; qty=(line->>'quantity')::numeric; loc=trim(line->>'location');
   select x into old_line from jsonb_array_elements(ship.items) x where x->>'id'=row_id;
   remaining=(old_line->>'sent')::numeric-(old_line->>'received')::numeric;
   if old_line is null or row_id=any(seen) or qty is null or qty<=0 or qty>remaining or qty<>round(qty,4)
      or coalesce(length(loc),0) not between 1 and 140 then raise exception 'Revisá cantidades pendientes y lugar de guardado.' using errcode='22023'; end if;
   seen=array_append(seen,row_id);
   select state into vessel.state from boat_control.boats where id=b;
   target=boat_control.stockroom_match(vessel.state->'products',old_line,loc,nullif(line->>'targetProductId',''));
   perform boat_control.stock_delta(b,coalesce(target,jsonb_build_object('name',old_line->>'name','unit',old_line->>'unit','area',old_line->>'area','location',loc)),
    qty,actor.id,'Paquete recibido de Tierra · '||ship_id::text);
   select jsonb_agg(case when x->>'id'=row_id then x||jsonb_build_object('received',(old_line->>'received')::numeric+qty) else x end order by n)
    into normalized from jsonb_array_elements(normalized) with ordinality entries(x,n);
   received_rows=received_rows||jsonb_build_array(jsonb_build_object('lineId',row_id,'name',old_line->>'name','unit',old_line->>'unit','quantity',qty,'location',loc));
  end loop;
  status_after=case when exists(select 1 from jsonb_array_elements(normalized) x where (x->>'received')::numeric<(x->>'sent')::numeric) then 'partial' else 'received' end;
  note=coalesce(payload->>'note','');
  if length(note)>300 then raise exception 'La observación supera 300 caracteres.' using errcode='22023'; end if;
  insert into boat_control.stockroom_package_receipts(package_id,received_by,photo_id,items,note) values(ship_id,actor.id,attachment,received_rows,note);
  update boat_control.stockroom_packages set items=normalized,status=status_after where id=ship_id;
  perform boat_control.stockroom_package_notify(b,actor.id,'package_received',jsonb_build_object('packageId',ship_id,'boat',vessel.name,'status',status_after));
 end if;
 answer=jsonb_build_object('ok',true,'id',ship_id,'status',status_after);
 insert into boat_control.operation_receipts(user_id,key,request,result,created_at) values(actor.id,k,request,answer,now());
 return answer;
end $$;
revoke all on function boat_control.stockroom_package(text,text,jsonb) from public,anon,authenticated;
create function public.boat_stockroom_package_rpc(server_key text,operation text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select boat_control.stockroom_package(server_key,operation,payload)$$;
revoke all on function public.boat_stockroom_package_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.stockroom_package(text,text,jsonb),public.boat_stockroom_package_rpc(text,text,jsonb) to anon;

-- Carry depot receipts in the protected transfer comparison. A backup from
-- before an intake must not undo onboard stock while keeping the receipt applied.
alter function boat_control.backup_snapshot(text) rename to backup_snapshot_before_packages;
revoke all on function boat_control.backup_snapshot_before_packages(text) from public,anon,authenticated;
create function boat_control.backup_snapshot(b text) returns jsonb
language sql stable set search_path='' as $$
 with existing as (select boat_control.backup_snapshot_before_packages(b) snapshot), package_receipts as (
  select coalesce(jsonb_agg(jsonb_build_object('kind','warehouse_package_receive','id',r.id,'packageId',r.package_id,'items',r.items,'photo',r.photo_id)
   order by r.received_at,r.id),'[]') additions
  from boat_control.stockroom_package_receipts r join boat_control.stockroom_packages p on p.id=r.package_id where p.boat_id=b)
 select jsonb_set(snapshot,'{transfers}',coalesce(snapshot->'transfers','[]')||additions) from existing,package_receipts
$$;
revoke all on function boat_control.backup_snapshot(text) from public,anon,authenticated;
