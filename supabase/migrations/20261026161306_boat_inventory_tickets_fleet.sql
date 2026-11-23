-- Only administrators load tickets and initial stock. Captains may consult fleet stock.
-- Wrap the existing entrypoints too, so older clients cannot bypass these rules.
alter function boat_control.intake(text,text,jsonb) rename to intake_before_inventory_roles;
revoke all on function boat_control.intake_before_inventory_roles(text,text,jsonb) from public,anon,authenticated;
create function boat_control.intake(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u boat_control.accounts%rowtype;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000';end if;
 if not u.admin then
  raise exception 'Solo el administrador puede cargar y revisar tickets, listas y existencias' using errcode='42501';
 end if;
 return boat_control.intake_before_inventory_roles(server_key,operation,payload);
end $$;
revoke all on function boat_control.intake(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.intake(text,text,jsonb) to anon;

-- Stock fields shared between boats. New product fields stay private by default.
create function boat_control.inventory_shared_product(p jsonb)
returns jsonb language sql immutable strict set search_path='' as $$
 select jsonb_build_object('id',p->>'id','name',p->>'name','area',coalesce(p->>'area','tecnica'),
  'unit',p->>'unit','current',p->'current','location',p->>'location','system',p->>'system',
  'code',p->>'code','specs',p->>'specs','expiryDate',p->>'expiryDate')
$$;
revoke all on function boat_control.inventory_shared_product(jsonb) from public,anon,authenticated;

alter function boat_control.operations(text,text,jsonb) rename to operations_before_inventory_roles;
revoke all on function boat_control.operations_before_inventory_roles(text,text,jsonb) from public,anon,authenticated;
create function boat_control.operations(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u boat_control.accounts%rowtype; r text; result jsonb;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000';end if;
 if operation in ('stock_add','request_receive') and not u.admin then
  raise exception 'Solo el administrador puede cargar existencias y recibir compras' using errcode='42501';
 end if;
 result=boat_control.operations_before_inventory_roles(server_key,operation,payload);
 if operation='overview' and not u.admin then
  select role into r from boat_control.members where user_id=u.id and boat_id=payload->>'boat';
  result=jsonb_set(result,'{fleet}',(select coalesce(jsonb_agg(
   case when b->>'id'=payload->>'boat' then b else jsonb_build_object(
    'id',b->>'id','name',b->>'name','products',(select coalesce(jsonb_agg(boat_control.inventory_shared_product(p)),'[]')
     from jsonb_array_elements(b->'products') p)) end),'[]')
   from jsonb_array_elements(result->'fleet') b where b->>'id'=payload->>'boat' or r='capitan'));
  result=jsonb_set(result,'{transfers}',(select coalesce(jsonb_agg(
   jsonb_set(t,'{product}',boat_control.inventory_shared_product(t->'product'))),'[]')
   from jsonb_array_elements(result->'transfers') t));
 end if;
 return result;
end $$;
revoke all on function boat_control.operations(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.operations(text,text,jsonb) to anon;

-- Shared stock is read-only. Boat membership still controls every stock write.
create function boat_control.inventory(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u boat_control.accounts%rowtype; r text; result jsonb; prior jsonb;
 k uuid; submitted jsonb;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if u.id is null then raise exception 'Iniciá sesión' using errcode='28000';end if;
 r=case when u.admin then 'administrador' else (select role from boat_control.members where boat_id=payload->>'boat' and user_id=u.id) end;
 if r is null or not exists(select 1 from boat_control.boats where id=payload->>'boat') then
  raise exception 'Sin acceso al barco' using errcode='42501';
 end if;
 if operation='fleet_stock' then
  if not u.admin and r<>'capitan' then
   raise exception 'Solo capitanes y administrador pueden consultar el stock de otros barcos' using errcode='42501';
  end if;
  -- Explicit allowlist: no invoices, prices, cameras, crew or passenger data.
  return (select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'revision',b.revision,
   'products',(select coalesce(jsonb_agg(boat_control.inventory_shared_product(p) order by p->>'name'),'[]')
    from jsonb_array_elements(coalesce(b.state->'products','[]')) p)) order by b.name),'[]')
   from boat_control.boats b);
 end if;
 if operation<>'ticket_confirm' then raise exception 'Operación desconocida';end if;
 if not u.admin then
  raise exception 'Administración debe confirmar existencias y gastos' using errcode='42501';
 end if;
 if payload->>'kind' is distinct from 'purchase' or payload->>'confirmed' is distinct from 'true'
  or payload->>'revision' is null then raise exception 'Revisá y confirmá el ticket y la recepción';end if;
 k=(payload->>'key')::uuid;
 if k is null then raise exception 'Falta identificador';end if;
 perform pg_advisory_xact_lock(hashtextextended(u.id||k::text,0));
 select request,receipt.result into prior,result from boat_control.operation_receipts receipt where user_id=u.id and key=k;
 if found then
  if prior<>((payload-'session')||jsonb_build_object('operation','ticket_confirm')) then
   raise exception 'Identificador reutilizado con otros datos';
  end if;
  return result;
 end if;
 -- Both steps run inside this transaction. A bad row rolls back the entire ticket.
 -- Derived keys allow retries after a lost HTTP response without duplicate stock.
 submitted=boat_control.intake(server_key,'submit',payload||jsonb_build_object('key',md5(k::text||':submit')::uuid));
 if submitted->>'status'='applied' then result=submitted||'{"alreadyApplied":true}'::jsonb;
 elsif submitted->>'status'='rejected' then raise exception 'Este ticket fue descartado. Revisá la carga anterior.';
 else
  result=boat_control.intake(server_key,'apply',payload||jsonb_build_object('id',submitted->>'id','key',md5(k::text||':apply')::uuid));
 end if;
 insert into boat_control.operation_receipts values(u.id,k,(payload-'session')||jsonb_build_object('operation','ticket_confirm'),result,now());
 return result;
end $$;
revoke all on function boat_control.inventory(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.inventory(text,text,jsonb) to anon;
create function public.boat_inventory_rpc(server_key text, operation text, payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select boat_control.inventory(server_key,operation,payload)
$$;
revoke all on function public.boat_inventory_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.boat_inventory_rpc(text,text,jsonb) to anon;
