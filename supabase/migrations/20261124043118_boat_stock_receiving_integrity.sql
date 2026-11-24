-- Resolve stock receipts against the destination under lock. Leave existing
-- records and balances intact, including distinct locations and legacy duplicates.
alter function boat_control.operations(text,text,jsonb) rename to operations_before_stock_receiving;
revoke all on function boat_control.operations_before_stock_receiving(text,text,jsonb) from public,anon,authenticated;

create function boat_control.operations(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor boat_control.accounts%rowtype;
  boat_id text := payload->>'boat';
  member_role text;
  request_key uuid;
  original_request jsonb := (payload-'session') || jsonb_build_object('operation',operation);
  receipt boat_control.operation_receipts%rowtype;
  effective_payload jsonb := payload;
  expected_name text; expected_unit text; expected_area text;
  destination text := nullif(trim(payload->>'location'),'');
  selected_id text := nullif(payload->>'productId','');
  transfer boat_control.transfers%rowtype;
  products jsonb; matches text[]; result jsonb;
begin
  if operation not in ('stock_add','request_receive','transfer_receive') then
    return boat_control.operations_before_stock_receiving(server_key,operation,payload);
  end if;
  if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
    raise exception 'Servidor no autorizado' using errcode='42501';
  end if;
  select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
  if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
  if not actor.admin then
    select m.role into member_role from boat_control.members m where m.user_id=actor.id and m.boat_id=payload->>'boat';
    if operation<>'transfer_receive' or coalesce(member_role,'') not in ('encargado','capitan','chef') then
      raise exception 'Sin permiso para cargar estas existencias' using errcode='42501';
    end if;
  end if;
  request_key := (payload->>'key')::uuid;
  if request_key is null then raise exception 'Falta identificador de operación' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.id||request_key::text,0));
  select * into receipt from boat_control.operation_receipts where user_id=actor.id and key=request_key;
  if found then
    if receipt.request is distinct from original_request then raise exception 'Identificador reutilizado con otros datos' using errcode='22023'; end if;
    return receipt.result;
  end if;
  if destination is null then raise exception 'Indicá la ubicación de destino' using errcode='22023'; end if;

  -- Lock in the same order as the underlying operation and its retry path.
  if operation='request_receive' then
    select q.name,q.unit,q.area into expected_name,expected_unit,expected_area from boat_control.requests q
      where q.id=(payload->>'id')::uuid and q.boat_id=payload->>'boat' for update;
    if not found then raise exception 'Pedido inexistente' using errcode='22023'; end if;
  elsif operation='transfer_receive' then
    select * into transfer from boat_control.transfers t where t.id=(payload->>'id')::uuid and t.target_id=boat_id for update;
    if not found then raise exception 'Transferencia no disponible para este destino' using errcode='22023'; end if;
    perform 1 from boat_control.boats where id in(transfer.source_id,transfer.target_id) order by id for update;
    expected_name:=transfer.product->>'name'; expected_unit:=transfer.product->>'unit'; expected_area:=coalesce(transfer.product->>'area','tecnica');
  else
    expected_name:=payload->>'name'; expected_unit:=payload->>'unit'; expected_area:=payload->>'area';
  end if;
  select b.state->'products' into products from boat_control.boats b where b.id=boat_id for update;
  if not found then raise exception 'Sin acceso al barco' using errcode='42501'; end if;
  select array_agg(p->>'id') into matches from jsonb_array_elements(products) p
   where lower(normalize(trim(p->>'name'), NFC))=lower(normalize(trim(expected_name), NFC)) and lower(normalize(trim(p->>'unit'), NFC))=lower(normalize(trim(expected_unit), NFC))
     and coalesce(p->>'area','tecnica')=expected_area and lower(normalize(trim(p->>'location'), NFC))=lower(normalize(destination, NFC))
     and (selected_id is null or p->>'id'=selected_id);
  if operation='stock_add' and cardinality(matches)>0 then
    raise exception 'El insumo ya existe en esa ubicación. Usá un conteo para corregir sus existencias.' using errcode='22023';
  elsif selected_id is not null and matches is null then
    raise exception 'El insumo seleccionado no coincide con el producto, unidad, área y ubicación recibidos.' using errcode='22023';
  elsif cardinality(matches)>1 then
    raise exception 'Hay varias fichas coincidentes. Seleccioná el insumo que recibió la mercadería.' using errcode='22023';
  elsif selected_id is null and cardinality(matches)=1 then
    effective_payload:=payload||jsonb_build_object('productId',matches[1]);
  end if;
  result:=boat_control.operations_before_stock_receiving(server_key,operation,effective_payload);
  if effective_payload is distinct from payload then
    -- Store the client request, so retrying after the first match or another
    -- subsequent stock change can return the original result verbatim.
    update boat_control.operation_receipts set request=original_request where user_id=actor.id and key=request_key;
  end if;
  return result;
end $$;
revoke all on function boat_control.operations(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.operations(text,text,jsonb) to anon;

-- The absolute count and its movements have just been staged in this transaction.
-- A failure here rolls back the balances, movements, audit and document together.
create function boat_control.check_stock_count_day() returns trigger
language plpgsql set search_path='' as $$
declare
  conflict_name text;
begin
  with movements as materialized (
    select m from boat_control.boats b, lateral jsonb_array_elements(b.state->'movements') m where b.id=new.boat_id
  ), counted as (
    select m->>'productId' as product_id,m->>'name' as name from movements where m->>'intakeId'=new.id::text
  )
  select c.name into conflict_name from counted c join movements later on later.m->>'productId'=c.product_id
  where left(later.m->>'date',10) > new.data->>'date' and left(later.m->>'date',10) ~ '^\d{4}-\d{2}-\d{2}$'
  limit 1;
  if found then
    raise exception 'Hay movimientos posteriores al conteo de %. Revisá el historial y registrá un conteo vigente.',conflict_name using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function boat_control.check_stock_count_day() from public,anon,authenticated;
create trigger stock_count_day before update of status on boat_control.stock_intakes
  for each row when (old.status='pending' and new.status='applied' and new.kind='count')
  execute function boat_control.check_stock_count_day();

