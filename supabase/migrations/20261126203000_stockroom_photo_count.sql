-- Administrative stockroom count: apply a reviewed list in one transaction.
create function boat_control.stockroom_photo_count(server_key text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor boat_control.accounts%rowtype; depot boat_control.stockroom%rowtype;
  receipt boat_control.operation_receipts%rowtype; batch_key uuid; request jsonb; answer jsonb;
  item jsonb; product jsonb; product_id text; loc text; qty numeric; previous numeric;
  seen text[] := '{}'; added_moves jsonb := '[]'::jsonb;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
   raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
  where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 if actor.admin is distinct from true then raise exception 'Reservado a administración.' using errcode='42501'; end if;
 batch_key=(payload->>'key')::uuid;
 if batch_key is null or payload->>'scope' is distinct from 'depot' or payload->'confirmed' is distinct from 'true'::jsonb
   or jsonb_typeof(payload->'items') is distinct from 'array' then
   raise exception 'Revisá y confirmá el conteo del depósito.' using errcode='22023';
 end if;
 if jsonb_array_length(payload->'items') not between 1 and 100 then
   raise exception 'Se pueden confirmar entre 1 y 100 filas por carga.' using errcode='22023';
 end if;
 request=(payload-'session')||jsonb_build_object('operation','warehouse_photo_count');
 perform pg_advisory_xact_lock(hashtextextended(actor.id||batch_key::text,0));
 select * into receipt from boat_control.operation_receipts where user_id=actor.id and key=batch_key;
 if found then
   if receipt.request is distinct from request then raise exception 'Identificador reutilizado' using errcode='22023'; end if;
   return receipt.result;
 end if;
 select * into strict depot from boat_control.stockroom where id for update;
 if (payload->>'revision')::integer is distinct from depot.revision then
   raise exception 'Cambió el inventario del depósito. Volvé a leer y revisar el conteo.' using errcode='40001';
 end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
   loc=trim(item->>'location');
   if jsonb_typeof(item->'quantity') is distinct from 'number'
      or coalesce(length(loc),0) not between 1 and 140
      or coalesce(length(trim(item->>'name')),0) not between 1 and 140
      or coalesce(length(trim(item->>'unit')),0) not between 1 and 20
      or coalesce(item->>'area','') not in ('tecnica','gastronomia') then
     raise exception 'Revisá producto, cantidad, unidad, área y ubicación.' using errcode='22023';
   end if;
   qty=(item->>'quantity')::numeric;
   if qty<0 or qty>=1e9 or qty<>round(qty,4) then raise exception 'Cantidad inválida' using errcode='22023'; end if;
   product=boat_control.stockroom_match(depot.products,item,loc,nullif(item->>'productId',''));
   if product is null then
     product=jsonb_build_object('id',gen_random_uuid()::text,'name',trim(item->>'name'),
       'unit',trim(item->>'unit'),'area',item->>'area','location',loc,'current',0);
   end if;
   product_id=product->>'id';
   if product_id=any(seen) then raise exception 'Un producto figura dos veces en el conteo.' using errcode='22023'; end if;
   seen=array_append(seen,product_id);
   previous=(product->>'current')::numeric;
   product=product||jsonb_build_object('current',qty);
   if exists(select 1 from jsonb_array_elements(depot.products) x where x->>'id'=product_id) then
     select jsonb_agg(case when x->>'id'=product_id then product else x end order by n)
     into depot.products from jsonb_array_elements(depot.products) with ordinality entries(x,n);
   else depot.products=depot.products||jsonb_build_array(product); end if;
   added_moves=added_moves||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'batchId',batch_key,
     'productId',product_id,'name',product->>'name','unit',product->>'unit','delta',qty-previous,'balance',qty,
     'date',(now() at time zone 'America/Panama')::date,'reason','Conteo físico por foto','responsible',actor.name));
 end loop;
 update boat_control.stockroom set products=depot.products,movements=depot.movements||added_moves,revision=depot.revision+1 where id;
 answer=jsonb_build_object('ok',true,'rows',cardinality(seen),'revision',depot.revision+1);
 insert into boat_control.operation_receipts(user_id,key,request,result,created_at) values(actor.id,batch_key,request,answer,now());
 return answer;
end $$;
revoke all on function boat_control.stockroom_photo_count(text,jsonb) from public,anon,authenticated;
create function public.boat_stockroom_photo_count_rpc(server_key text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select boat_control.stockroom_photo_count(server_key,payload)$$;
revoke all on function public.boat_stockroom_photo_count_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.stockroom_photo_count(text,jsonb),public.boat_stockroom_photo_count_rpc(text,jsonb) to anon;
