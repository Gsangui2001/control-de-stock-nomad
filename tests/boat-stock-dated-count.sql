-- Run after boat-inventory-tickets-fleet.sql within its isolated transaction.
do $$
declare
  boat text:='10000000000000000000000000000001';
  sample_day date:=(now() at time zone 'America/Buenos_Aires')::date;
  base jsonb:=jsonb_build_object('boat',boat,'session','inventory-admin-session');
  body jsonb; reviewed jsonb; req jsonb; doc jsonb; result jsonb; version integer; refused boolean;
begin
  select revision into version from boat_control.boats where id=boat;
  body:=jsonb_build_object('date',sample_day-1,'items',jsonb_build_array(jsonb_build_object('name','Agua 500 ml','quantity',30,'unit','botellas','area','gastronomia','location','Bodega')));
  req:=base||jsonb_build_object('key',gen_random_uuid(),'kind','count','source',jsonb_build_object('text','Stock físico de ayer para prueba','photos','[]'::jsonb),'data',body);
  doc:=public.boat_intake_rpc('inventory-fixture-key','submit',req);
  reviewed:=base||jsonb_build_object('key',gen_random_uuid(),'id',doc->>'id','revision',version,'confirmed',true,'data',body);
  refused:=false;
  begin perform public.boat_intake_rpc('inventory-fixture-key','apply',reviewed); exception when sqlstate '22023' then refused:=true; end;
  assert refused and version=(select revision from boat_control.boats where id=boat),'un conteo antiguo no puede borrar movimientos posteriores del mismo insumo';
  assert (select status='pending' from boat_control.stock_intakes where id=(doc->>'id')::uuid),'la carga original queda disponible para revisión';

  -- The same item at another location is independent, even on an earlier date.
  body:=jsonb_set(body,'{items,0,location}','"Armario de popa"');
  req:=req||jsonb_build_object('key',gen_random_uuid(),'source',jsonb_build_object('text','Conteo independiente de popa'),'data',body);
  doc:=public.boat_intake_rpc('inventory-fixture-key','submit',req);
  reviewed:=reviewed||jsonb_build_object('key',gen_random_uuid(),'id',doc->>'id','data',body);
  result:=public.boat_intake_rpc('inventory-fixture-key','apply',reviewed);
  assert result->>'status'='applied','otros productos y ubicaciones no bloquean el conteo';

  -- A day without times has no implied internal ordering.
  body:=jsonb_set(jsonb_set(body,'{date}',to_jsonb(sample_day)),'{items,0,location}','"Bodega"');
  req:=req||jsonb_build_object('key',gen_random_uuid(),'source',jsonb_build_object('text','Conteo físico de hoy'),'data',body);
  doc:=public.boat_intake_rpc('inventory-fixture-key','submit',req);
  select revision into version from boat_control.boats where id=boat;
  reviewed:=reviewed||jsonb_build_object('id',doc->>'id','revision',version,'key',gen_random_uuid(),'data',body);
  result:=public.boat_intake_rpc('inventory-fixture-key','apply',reviewed);
  assert result->>'status'='applied','conteo confirmado del mismo día';
  assert public.boat_intake_rpc('inventory-fixture-key','apply',reviewed)=result,'reintento idéntico del conteo incluido';
end $$;
