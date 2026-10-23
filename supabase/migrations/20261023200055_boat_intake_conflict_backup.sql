create or replace function boat_control.intake(server_key text,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u boat_control.accounts%rowtype; b boat_control.boats%rowtype; r text; manager boolean;
 doc boat_control.stock_intakes%rowtype; src jsonb; data jsonb; entry jsonb; p jsonb; items jsonb; movements jsonb; lines jsonb='[]'; ids text[]=array[]::text[];
 digest text; qty numeric; delta numeric; balance numeric; cost numeric; result jsonb; old jsonb; k uuid; d date; matches integer; money boolean; ref text; kind text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501';end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000';end if;
 select * into b from boat_control.boats where id=payload->>'boat';
 r=case when u.admin then 'administrador' else (select role from boat_control.members where boat_id=b.id and user_id=u.id) end;
 if b.id is null or r is null then raise exception 'Sin acceso al barco' using errcode='42501';end if;
 manager=u.admin or r='encargado';
 if operation='list' then return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from (select i.*,a.name as author from boat_control.stock_intakes i join boat_control.accounts a on a.id=i.created_by where i.boat_id=b.id order by i.created_at desc limit 200) x);end if;
 if r='lector' then raise exception 'Solo lectura' using errcode='42501';end if;
 if operation='scan_access' then return jsonb_build_object('ok',true);end if;
 k=(payload->>'key')::uuid;if k is null then raise exception 'Falta identificador';end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id||k::text,0));
 select request,receipt.result into old,result from boat_control.operation_receipts receipt where user_id=u.id and key=k;
 if found then
  if old<>((payload-'session')||jsonb_build_object('operation','intake_'||operation)) then raise exception 'Identificador reutilizado con otros datos';end if;
  return result;
 end if;
 select * into b from boat_control.boats where id=b.id for update;
 if operation='submit' then
  kind=payload->>'kind';src=payload->'source';data=payload->'data';
  if kind not in ('count','purchase','expense','request') or jsonb_typeof(data->'items')<>'array' or jsonb_array_length(data->'items')>100 then raise exception 'Documento inválido';end if;
  for ref in select jsonb_array_elements_text(coalesce(src->'photos','[]')) loop
   if not exists(select 1 from boat_control.photos ph where ph.boat_id=b.id and '/api/boat/photos?boat='||b.id||'&id='||ph.id::text=ref) then raise exception 'Foto no disponible para este barco';end if;
  end loop;
  -- Uploaded photos already have content-based unique identities. OCR edits do
  -- not defeat deduplication of the same photograph.
  digest=encode(extensions.digest(case when jsonb_array_length(coalesce(src->'photos','[]'))>0 then (select string_agg(v,'|' order by v) from jsonb_array_elements_text(src->'photos') v) else trim(src->>'text') end,'sha256'),'hex');
  if digest is null or (coalesce(src->>'text','')='' and jsonb_array_length(coalesce(src->'photos','[]'))=0) then raise exception 'Adjuntá una foto o una lista';end if;
  insert into boat_control.stock_intakes(boat_id,kind,source_hash,source,data,created_by) values(b.id,kind,digest,src,data,u.id)
   on conflict on constraint stock_intakes_boat_id_kind_source_hash_key do nothing returning * into doc;
  if doc.id is null then select * into doc from boat_control.stock_intakes where boat_id=b.id and stock_intakes.kind=kind and source_hash=digest;end if;
  result=jsonb_build_object('id',doc.id,'status',doc.status);
 elsif operation in ('apply','reject') then
  select * into doc from boat_control.stock_intakes where id=(payload->>'id')::uuid and boat_id=b.id for update;
  if doc.id is null then raise exception 'Carga inexistente';end if;
  if not manager and not (doc.kind='request' and doc.created_by=u.id and operation='apply') then raise exception 'Administración debe confirmar existencias y gastos' using errcode='42501';end if;
  if doc.status='applied' then return jsonb_build_object('id',doc.id,'status','applied','alreadyApplied',true);end if;
  if doc.status<>'pending' then raise exception 'La carga ya fue revisada';end if;
  if operation='reject' then update boat_control.stock_intakes set status='rejected',reviewed_by=u.id,reviewed_at=now() where id=doc.id;
  else
   if (payload->>'revision')::integer<>b.revision then raise exception 'El stock cambió. Actualizá y revisá las cantidades antes de confirmar.' using errcode='40001';end if;
   if payload->>'confirmed'<>'true' then raise exception 'Revisá y confirmá los datos';end if;
   data=payload->'data';money=doc.kind in ('purchase','expense');d=(data->>'date')::date;
   if d is null or d>(now() at time zone 'America/Buenos_Aires')::date then raise exception 'Fecha inválida';end if;
   if jsonb_typeof(data->'items')<>'array' or jsonb_array_length(data->'items')>100 or (doc.kind<>'expense' and jsonb_array_length(data->'items')=0) then raise exception 'Revisá las filas';end if;
   if money then
    if exists(select 1 from boat_control.stock_intakes x where x.boat_id=b.id and x.status='applied' and x.kind in ('purchase','expense') and x.source_hash=doc.source_hash) then raise exception 'Este documento ya generó un gasto. No se vuelve a cargar como compra o gasto.';end if;
    if data->>'currency' not in ('USD','EUR','ARS','PAB') or nullif(trim(data->>'supplier'),'') is null or data->>'total' is null or (data->>'total')::numeric<0 or (data->>'total')::numeric>1e9 then raise exception 'Confirmá proveedor, moneda e importe';end if;
    if nullif(trim(data->>'reference'),'') is not null and exists(select 1 from boat_control.stock_intakes x where x.boat_id=b.id and x.status='applied' and x.kind in ('purchase','expense') and lower(trim(x.data->>'supplier'))=lower(trim(data->>'supplier')) and lower(trim(x.data->>'reference'))=lower(trim(data->>'reference')) and x.data->>'date'=data->>'date') then raise exception 'Ese comprobante ya fue registrado. Revisá el historial.';end if;
   end if;
   items=b.state->'products';movements=b.state->'movements';
   for entry in select v from jsonb_array_elements(case when doc.kind='expense' then '[]'::jsonb else data->'items' end) v loop
    qty=(entry->>'quantity')::numeric;cost=(entry->>'unitCost')::numeric;
    if nullif(trim(entry->>'name'),'') is null or nullif(trim(entry->>'unit'),'') is null or entry->>'area' not in ('gastronomia','tecnica') or qty is null or qty<0 or qty>1e9 or (doc.kind<>'count' and qty=0) or (cost is not null and (cost<0 or cost>1e9)) then raise exception 'Completá producto, cantidad, unidad y área';end if;
    if doc.kind='request' then
     insert into boat_control.requests(boat_id,area,name,unit,quantity,notes,created_by) values(b.id,entry->>'area',entry->>'name',entry->>'unit',qty,'Lista adjunta '||doc.id::text||'. '||coalesce(data->>'notes',''),u.id);
     continue;
    end if;
    if nullif(trim(entry->>'location'),'') is null then raise exception 'Indicá la ubicación';end if;
    p=null;
    if nullif(entry->>'productId','') is not null then
     select v into p from jsonb_array_elements(items) v where v->>'id'=entry->>'productId';
     if p is null then raise exception 'Insumo seleccionado inexistente';end if;
    else
     select count(*) into matches from jsonb_array_elements(items) v where lower(trim(v->>'name'))=lower(trim(entry->>'name')) and lower(trim(v->>'unit'))=lower(trim(entry->>'unit')) and coalesce(v->>'area','tecnica')=entry->>'area' and lower(trim(v->>'location'))=lower(trim(entry->>'location'));
     if matches>1 then raise exception 'Hay varios insumos iguales. Seleccioná el existente.';end if;
     select v into p from jsonb_array_elements(items) v where lower(trim(v->>'name'))=lower(trim(entry->>'name')) and lower(trim(v->>'unit'))=lower(trim(entry->>'unit')) and coalesce(v->>'area','tecnica')=entry->>'area' and lower(trim(v->>'location'))=lower(trim(entry->>'location'));
    end if;
    if p is null then p=jsonb_build_object('id',gen_random_uuid()::text,'name',entry->>'name','unit',entry->>'unit','area',entry->>'area','system',case when entry->>'area'='gastronomia' then 'Gastronomía' else 'Otros' end,'location',entry->>'location','current',0,'min',0,'target',0,'cost',0,'costKnown',false,'photo','');end if;
    if lower(p->>'unit')<>lower(entry->>'unit') or coalesce(p->>'area','tecnica')<>entry->>'area' or lower(p->>'location')<>lower(entry->>'location') then raise exception 'Unidad, área o ubicación no coinciden con el insumo seleccionado';end if;
    if p->>'id'=any(ids) then raise exception 'El mismo insumo aparece dos veces. Unificá las filas.';end if;ids=array_append(ids,p->>'id');
    delta=case when doc.kind='count' then qty-(p->>'current')::numeric else qty end;balance=(p->>'current')::numeric+delta;
    if balance>1e12 then raise exception 'Cantidad excesiva';end if;
    p=p||jsonb_build_object('current',balance);
    if doc.kind='purchase' then p=p||jsonb_build_object('cost',case when data->>'currency'=b.state->'boat'->>'currency' then coalesce(cost,0) else 0 end,'costKnown',cost is not null and data->>'currency'=b.state->'boat'->>'currency','costCurrency',data->>'currency','lastInvoiceUnitCost',cost,'supplier',data->>'supplier');end if;
    select coalesce(jsonb_agg(case when v->>'id'=p->>'id' then p else v end),'[]') into items from jsonb_array_elements(items) v;
    if not exists(select 1 from jsonb_array_elements(items) v where v->>'id'=p->>'id') then items=items||jsonb_build_array(p);end if;
    movements=movements||jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'productId',p->>'id','name',p->>'name','unit',p->>'unit','delta',delta,'balance',balance,'date',d::text,'reason',case when doc.kind='count' then 'Conteo confirmado' else 'Compra recibida' end,'intakeId',doc.id,'responsible',u.name));
    lines=lines||jsonb_build_array(jsonb_build_object('productId',p->>'id','name',p->>'name','unit',p->>'unit','quantity',qty,'cost',coalesce(cost,0),'costKnown',cost is not null));
   end loop;
   if doc.kind in ('count','purchase') then b.state=jsonb_set(jsonb_set(b.state,'{products}',items),'{movements}',movements);end if;
   if money then b.state=jsonb_set(b.state,'{purchases}',(b.state->'purchases')||jsonb_build_array(jsonb_build_object('id',doc.id::text,'intakeId',doc.id,'date',d::text,'supplier',data->>'supplier','reference',data->>'reference','total',(data->>'total')::numeric,'currency',data->>'currency','lines',lines,'notes',data->>'notes','stockIncluded',doc.kind='purchase','recordedBy',u.name,'recordedAt',now(),'photos',doc.source->'photos')));end if;
   update boat_control.boats set state=b.state,revision=revision+1 where id=b.id;
   insert into boat_control.audit(boat_id,user_id,revision) select id,u.id,revision from boat_control.boats where id=b.id;
   update boat_control.stock_intakes set data=data,status='applied',reviewed_by=u.id,reviewed_at=now() where id=doc.id;
  end if;
  result=jsonb_build_object('id',doc.id,'status',case when operation='apply' then 'applied' else 'rejected' end);
 else raise exception 'Operación desconocida';end if;
 insert into boat_control.operation_receipts values(u.id,k,(payload-'session')||jsonb_build_object('operation','intake_'||operation),result,now());
 return result;
end $$;

create or replace function boat_control.backup_snapshot(b text) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('version',1,'boat',b,'revision',bb.revision,'state',bb.state,
 'intakes',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from boat_control.stock_intakes i where i.boat_id=b),
 'requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from boat_control.requests q where q.boat_id=b),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from boat_control.transfers t where t.source_id=b or t.target_id=b),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.reservation_id),'[]') from boat_control.reservation_links l where l.boat_id=b),
 'instructions',(select coalesce(jsonb_agg(to_jsonb(c) order by c.reservation_id),'[]') from boat_control.collection_instructions c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'collections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from boat_control.collections c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'photos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from boat_control.photos p where p.boat_id=b)) from boat_control.boats bb where bb.id=b;
$$;
create or replace function boat_control.backup_operation(server_key text,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u text; b text=payload->>'boat'; snapshot jsonb; saved jsonb=payload->'backup'; key_id uuid; old_request jsonb; result jsonb; section text; record_row jsonb; revision_now integer; begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 select a.id into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now() and a.admin;
 if u is null then raise exception 'Solo administración' using errcode='42501'; end if;
 select revision into revision_now from boat_control.boats where id=b for update;
 if not found then raise exception 'Barco inexistente'; end if;
 snapshot=boat_control.backup_snapshot(b);
 if operation='backup' then return snapshot; end if;
 if operation<>'backup_restore' then raise exception 'Operación desconocida'; end if;
 key_id=(payload->>'key')::uuid;if key_id is null then raise exception 'Falta identificador'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u||key_id::text,0));
 select request,receipt.result into old_request,result from boat_control.operation_receipts receipt where user_id=u and key=key_id;
 if found then
  if old_request<>jsonb_build_object('backupHash',encode(extensions.digest(saved::text,'sha256'),'hex'),'boat',b) then raise exception 'Identificador reutilizado'; end if;
  return result;
 end if;
 if saved->>'version'<>'1' or saved->>'boat'<>b or revision_now<>(payload->>'revision')::integer then raise exception 'Respaldo de otro barco o datos cambiados. Actualizá antes de restaurar.' using errcode='PT409'; end if;
 foreach section in array array['transfers','reservations','instructions','collections'] loop
  if saved->section is distinct from snapshot->section then raise exception 'Hay cambios posteriores en transferencias, reservas o cobros. Conservamos esos registros: se necesita una recuperación coordinada.'; end if;
 end loop;
 if coalesce(saved->'intakes','[]'::jsonb) is distinct from snapshot->'intakes' then raise exception 'Hay cargas de stock o gastos posteriores al respaldo. Se necesita una recuperación coordinada para conservar su historial.';end if;
 if saved->'state'->>'schema'<>'1' or length(saved->'state'->'boat'->>'name')=0 then raise exception 'Estado inválido'; end if;
 foreach section in array array['products','tasks','logs','movements','purchases','cameras'] loop
  if jsonb_typeof(saved->'state'->section)<>'array' then raise exception 'Estado inválido'; end if;
 end loop;
 for record_row in select x from jsonb_array_elements(saved->'state'->'products') x loop
  if (record_row->>'current')::numeric<0 or (record_row->>'min')::numeric<0 or (record_row->>'cost')::numeric<0 then raise exception 'Stock inválido'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(saved->'requests') q where q->>'boat_id'<>b) or exists(select 1 from jsonb_array_elements(saved->'photos') p where p->>'boat_id'<>b) then raise exception 'El respaldo contiene datos de otro barco'; end if;
 insert into boat_control.backup_versions(boat_id,snapshot,actor_id) values(b,snapshot,u);
 delete from boat_control.requests where boat_id=b;
 insert into boat_control.requests select * from jsonb_populate_recordset(null::boat_control.requests,saved->'requests');
 insert into boat_control.photos select * from jsonb_populate_recordset(null::boat_control.photos,saved->'photos') on conflict(id) do nothing;
 update boat_control.boats set state=saved->'state',name=saved->'state'->'boat'->>'name',revision=revision+1 where id=b returning revision into revision_now;
 insert into boat_control.audit(boat_id,user_id,revision) values(b,u,revision_now);
 perform boat_control.emit_event(b,u,'respaldo_restaurado');
 result=jsonb_build_object('ok',true,'revision',revision_now);
 insert into boat_control.operation_receipts values(u,key_id,jsonb_build_object('backupHash',encode(extensions.digest(saved::text,'sha256'),'hex'),'boat',b),result,now());
 return result;
end $$;
