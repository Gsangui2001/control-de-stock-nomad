-- Run after boat-operations.sql within the same isolated, rolled-back transaction.
do $$
declare
  source_boat text := '00000000000000000000000000000001';
  target_boat text := '00000000000000000000000000000002';
  base jsonb := jsonb_build_object('boat',source_boat,'session','ops-test-session');
  req jsonb; response jsonb; first_response jsonb; item jsonb; rejected boolean;
  order_id uuid; transfer_id uuid; product_id text; target_id text; version_before integer;
begin
  assert not has_function_privilege('anon','boat_control.operations_before_stock_receiving(text,text,jsonb)','execute'), 'la ruta anterior queda privada';
  assert not has_function_privilege('authenticated','boat_control.operations_before_stock_receiving(text,text,jsonb)','execute'), 'el cliente autenticado tampoco invoca el alias privado';
  req := base || jsonb_build_object('key',gen_random_uuid(),'area','tecnica','name','Junta de bomba','unit','un','quantity',10);
  response := public.boat_operations_rpc('test-only-operations','request_create',req);
  order_id := (response->>'id')::uuid;
  foreach product_id in array array['solicitado','aprobado','comprado'] loop
    perform public.boat_operations_rpc('test-only-operations','request_status',base || jsonb_build_object('key',gen_random_uuid(),'id',order_id,'status',product_id));
  end loop;
  req := base || jsonb_build_object('key',gen_random_uuid(),'id',order_id,'quantity',4,'location','Pañol','productId','');
  perform public.boat_operations_rpc('test-only-operations','request_receive',req);
  req := req || jsonb_build_object('key',gen_random_uuid(),'quantity',6,'location',U&'  PAN\0303OL  ');
  first_response := public.boat_operations_rpc('test-only-operations','request_receive',req);
  assert public.boat_operations_rpc('test-only-operations','request_receive',req) = first_response, 'retry after implicit product match';
  assert (select count(*)=1 and sum((p->>'current')::numeric)=10 from boat_control.boats b, lateral jsonb_array_elements(b.state->'products') p where b.id=source_boat and p->>'name'='Junta de bomba'), 'las dos recepciones deben acumular 10 un en una sola ficha';
  select p->>'id' into product_id from boat_control.boats b,lateral jsonb_array_elements(b.state->'products') p where b.id=source_boat and p->>'name'='Junta de bomba';

  req := base || jsonb_build_object('key',gen_random_uuid(),'area','tecnica','name','Junta de bomba','unit','un','quantity',10,'location','Pañol');
  rejected:=false;
  begin perform public.boat_operations_rpc('test-only-operations','stock_add',req); exception when sqlstate '22023' then rejected:=true; end;
  assert rejected,'el alta inicial repetida debe remitir a un conteo, sin sumar';
  req := req || jsonb_build_object('key',gen_random_uuid(),'name','Arandela','quantity',3);
  item := public.boat_operations_rpc('test-only-operations','stock_add',req);
  assert public.boat_operations_rpc('test-only-operations','stock_add',req)=item,'retry initial count without duplication';

  req := base || jsonb_build_object('key',gen_random_uuid(),'target',target_boat,'productId',product_id,'quantity',6);
  perform public.boat_operations_rpc('test-only-operations','transfer_send',req);
  select id into transfer_id from boat_control.transfers where product->>'id'=product_id;
  req := base || jsonb_build_object('boat',target_boat,'key',gen_random_uuid(),'id',transfer_id,'quantity',2,'location','Almacén');
  perform public.boat_operations_rpc('test-only-operations','transfer_receive',req);
  select p->>'id' into target_id from boat_control.boats b,lateral jsonb_array_elements(b.state->'products') p where b.id=target_boat and p->>'name'='Junta de bomba';
  req := req || jsonb_build_object('key',gen_random_uuid(),'quantity',4);
  select revision into version_before from boat_control.boats where id=target_boat;
  rejected:=false;
  begin perform public.boat_operations_rpc('test-only-operations','transfer_receive',req||jsonb_build_object('productId',target_id,'location','Otra ubicación')); exception when sqlstate '22023' then rejected:=true; end;
  assert rejected and version_before=(select revision from boat_control.boats where id=target_boat),'inconsistent chosen location leaves stock unchanged';
  rejected:=false;
  begin perform public.boat_operations_rpc('test-only-operations','transfer_receive',req||jsonb_build_object('quantity',5)); exception when others then rejected:=true; end;
  assert rejected and (select received from boat_control.transfers where id=transfer_id)=2,'excess receipt leaves quantity in transit unchanged';
  perform public.boat_operations_rpc('test-only-operations','transfer_receive',req);
  perform public.boat_operations_rpc('test-only-operations','transfer_receive',req);
  assert (select count(*)=1 and sum((p->>'current')::numeric)=6 from boat_control.boats b, lateral jsonb_array_elements(b.state->'products') p where b.id=target_boat and p->>'name'='Junta de bomba'),'dos recepciones de un traslado actualizan el mismo insumo';
  assert (select received=6 and status='recibido' from boat_control.transfers where id=transfer_id),'completed transfer after recovery';
  assert (select sum((p->>'current')::numeric)=10 from boat_control.boats b, lateral jsonb_array_elements(b.state->'products') p where b.id in(source_boat,target_boat) and p->>'name'='Junta de bomba'),'total entre barcos conservado';
  -- Cancel a new dispatch before any receipt and retry the same request.
  req:=base||jsonb_build_object('key',gen_random_uuid(),'target',target_boat,'productId',product_id,'quantity',2);
  perform public.boat_operations_rpc('test-only-operations','transfer_send',req);
  select id into transfer_id from boat_control.transfers where product->>'id'=product_id and status='en_transito';
  req:=base||jsonb_build_object('key',gen_random_uuid(),'id',transfer_id);
  perform public.boat_operations_rpc('test-only-operations','transfer_cancel',req);
  perform public.boat_operations_rpc('test-only-operations','transfer_cancel',req);
  assert (select status='cancelado' and received=0 from boat_control.transfers where id=transfer_id),'cancelled dispatch never credits the destination';
  assert (select (p->>'current')::numeric=4 from boat_control.boats b,lateral jsonb_array_elements(b.state->'products') p where b.id=source_boat and p->>'id'=product_id),'cancelled transfer restores the source exactly once';

end $$;
