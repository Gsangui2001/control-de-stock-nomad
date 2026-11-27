-- Same-boat counted-stock move. Neither leg represents consumption.
create function boat_control.fridge_move(server_key text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor boat_control.accounts%rowtype; vessel boat_control.boats%rowtype;
 member_role text; bid text:=payload->>'boat'; movement_key uuid;
 source jsonb; target jsonb; request jsonb; receipt boat_control.operation_receipts%rowtype;
 qty numeric; result jsonb; from_balance numeric; to_balance numeric; label text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
  where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 if not actor.admin then
  select m.role into member_role from boat_control.members m where m.user_id=actor.id and m.boat_id=bid;
  if coalesce(member_role,'') not in ('encargado','capitan','chef','marinero') then
   raise exception 'Sin permiso para mover este stock' using errcode='42501';
  end if;
 end if;
 if jsonb_typeof(payload->'quantity') is distinct from 'number' then raise exception 'Cantidad inválida' using errcode='22023'; end if;
 qty:=(payload->>'quantity')::numeric;
 movement_key:=(payload->>'key')::uuid;
 if movement_key is null or qty<=0 or qty>1000000 or trunc(qty)<>qty then
  raise exception 'Indicá un número entero de unidades' using errcode='22023';
 end if;
 request:=(payload-'session')||jsonb_build_object('operation','fridge_move');
 perform pg_advisory_xact_lock(hashtextextended(actor.id||movement_key::text,0));
 select * into receipt from boat_control.operation_receipts where user_id=actor.id and key=movement_key;
 if found then
  if receipt.request is distinct from request then raise exception 'Identificador reutilizado con otros datos' using errcode='22023'; end if;
  return receipt.result;
 end if;
 select * into vessel from boat_control.boats where id=bid for update;
 if not found then raise exception 'Barco no disponible' using errcode='42501'; end if;
 select p into source from jsonb_array_elements(vessel.state->'products') p where p->>'id'=payload->>'productId';
 if source is null or source->>'area' is distinct from 'gastronomia'
    or coalesce(lower(trim(source->>'unit')),'') not in ('un','unidad','unidades','ud','uds','lata','latas','botella','botellas')
    or (coalesce(lower(trim(source->>'location')),'') !~ '^dep[oó]sito([[:space:]]|$)'
        and coalesce(lower(trim(source->>'location')),'') not in ('recepción a bordo','recepcion a bordo'))
    or coalesce(lower(source->>'name'),'') !~ '(^|[^[:alpha:]])(agua|cerveza|gaseosa|refresco|coca|pepsi|sprite|fanta|seven|fresca|soda|lata|7up|7-up)([^[:alpha:]]|$)' then
  raise exception 'Elegí una bebida en unidades del Depósito o de Recepción a bordo' using errcode='22023';
 end if;
 if (source->>'current')::numeric<qty then raise exception 'No alcanza el stock en esa ubicación' using errcode='22023'; end if;
 target:=boat_control.stockroom_match(vessel.state->'products',source,'Heladera',null);
 if target is null then
  target:=(source-'id'-'current'-'min'-'target'-'location'-'expiryDate')
      ||jsonb_build_object('id',gen_random_uuid()::text,'current',0,'min',0,'target',0,'location','Heladera')
      ||case when source ? 'expiryDate' then jsonb_build_object('expiryDate',source->'expiryDate') else '{}'::jsonb end;
  update boat_control.boats set state=jsonb_set(state,'{products}',(state->'products')||jsonb_build_array(target)) where id=bid;
 elsif nullif(source->>'expiryDate','') is distinct from nullif(target->>'expiryDate','') then
  raise exception 'Las fechas de vencimiento no coinciden; no se pueden mezclar estos lotes.' using errcode='22023';
 end if;
 label:='Traslado a heladera · '||movement_key::text;
 from_balance:=(boat_control.stock_delta(bid,source,-qty,actor.id,label||' · salida')->>'current')::numeric;
 to_balance:=(boat_control.stock_delta(bid,target,qty,actor.id,label||' · entrada')->>'current')::numeric;
 result:=jsonb_build_object('ok',true,'fromBalance',from_balance,'toBalance',to_balance,'quantity',qty);
 insert into boat_control.operation_receipts(user_id,key,request,result,created_at) values(actor.id,movement_key,request,result,now());
 return result;
end $$;
revoke all on function boat_control.fridge_move(text,jsonb) from public,anon,authenticated;
create function public.boat_fridge_move_rpc(server_key text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select boat_control.fridge_move(server_key,payload)
$$;
revoke all on function public.boat_fridge_move_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.fridge_move(text,jsonb),public.boat_fridge_move_rpc(text,jsonb) to anon;
