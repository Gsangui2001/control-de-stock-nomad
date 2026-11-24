-- Run in an isolated transaction after the normal boat-operations fixture setup.
do $$
declare
  vessel text='00000000000000000000000000000001'; base jsonb; data jsonb; request jsonb; saved jsonb;
  depot_id text; boat_item text; rejected boolean; prior_backup jsonb; next_state jsonb; next_revision integer; missing integer;
begin
  base=jsonb_build_object('session','ops-test-session','boat',vessel);
  rejected=false;begin perform public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base||'{"session":"ops-chef-session"}');
  exception when insufficient_privilege then rejected=true;end;assert rejected,'crew has no access to admin reports';
  assert not has_table_privilege('anon','boat_control.stockroom','select'),'no direct access to depot';
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base||'{"scope":"depot"}');
  assert data->>'depot'='Depósito' and data->'products'='[]' and data->'movements'='[]' and data->>'depotRevision'='0','empty warehouse is ready for a physical count';
  request=base||jsonb_build_object('key',gen_random_uuid(),'revision',0,'name','Arroz QA','unit','kg','location','Estante 1','area','gastronomia','quantity',12);
  perform public.boat_admin_stock_rpc('test-only-operations','warehouse_count',request);
  perform public.boat_admin_stock_rpc('test-only-operations','warehouse_count',request);
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base||'{"scope":"depot"}');
  depot_id=data->'products'->0->>'id'; assert data->>'depotRevision'='1' and data->'products'->0->>'current'='12';
  rejected=false;begin perform public.boat_admin_stock_rpc('test-only-operations','warehouse_count',request||jsonb_build_object('key',gen_random_uuid(),'quantity',11));
  exception when serialization_failure then rejected=true;end;assert rejected,'stale recount cannot overwrite a concurrent change';
  request=base||jsonb_build_object('key',gen_random_uuid(),'vessel',vessel,'direction','toBoat','productId',depot_id,'location','Armario 1','quantity',5);
  prior_backup=boat_control.backup_snapshot(vessel);
  saved=public.boat_admin_stock_rpc('test-only-operations','warehouse_transfer',request);
  assert public.boat_admin_stock_rpc('test-only-operations','warehouse_transfer',request)=saved;
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  select p->>'id' into boat_item from jsonb_array_elements(data->'products') p where p->>'name'='Arroz QA' and p->>'current'='5';
  assert boat_item is not null and data->'depotProducts'->0->>'current'='7','both legs exactly once';
  assert prior_backup->'transfers'<>boat_control.backup_snapshot(vessel)->'transfers','old boat backup cannot reverse just one leg';
  rejected=false;begin perform public.boat_admin_stock_rpc('test-only-operations','warehouse_transfer',request||jsonb_build_object('key',gen_random_uuid(),'quantity',20));
  exception when invalid_parameter_value then rejected=true;end;assert rejected;
  request=base||jsonb_build_object('key',gen_random_uuid(),'vessel',vessel,'direction','toDepot','productId',boat_item,'location','Estante 1','quantity',2);
  perform public.boat_admin_stock_rpc('test-only-operations','warehouse_transfer',request);
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert data->'depotProducts'->0->>'current'='9' and (select p->>'current'='3' from jsonb_array_elements(data->'products') p where p->>'id'=boat_item);
  perform public.boat_operations_rpc('test-only-operations','stock_consume',base||jsonb_build_object('key',gen_random_uuid(),'productId',boat_item,'quantity',1,'note','Cocina QA'));
  update boat_control.boats set state=jsonb_set(state,'{purchases}',(state->'purchases')||jsonb_build_array(
    jsonb_build_object('id','qa-ticket','currency','EUR','date',current_date,'total',10,'lines',jsonb_build_array(
     jsonb_build_object('productId',boat_item,'quantity',2,'cost',4,'costKnown',true))))) where id=vessel;
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert data->'expenses'->>'EUR'='10' and data->'groceryPurchases'->>'EUR'='8','ticket and grocery lines have independent totals';
  assert (data->>'consumptionMissing')::int>=1 and (data->'usedUnits'->>'kg')::numeric>=1,'uncosted consumption stays visible';
  request=base||jsonb_build_object('key',gen_random_uuid(),'revision',data->'depotRevision','name','Arroz QA','unit','kg','location','Estante 1','area','gastronomia','quantity',9,'unitCost',2.5,'currency','EUR','productId',depot_id);
  perform public.boat_admin_stock_rpc('test-only-operations','warehouse_count',request);
  request=base||jsonb_build_object('key',gen_random_uuid(),'vessel',vessel,'direction','toBoat','productId',depot_id,'location','Armario 1','quantity',1,'targetProductId',boat_item);
  perform public.boat_admin_stock_rpc('test-only-operations','warehouse_transfer',request);
  saved=public.boat_operations_rpc('test-only-operations','stock_consume',base||jsonb_build_object('key',gen_random_uuid(),'productId',boat_item,'quantity',2,'note','Otro consumo de prueba'));
  assert (saved->>'lastInvoiceUnitCost')::numeric=2.5,'administrator sees the recorded unit cost';
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert (data->'groceryConsumption'->>'EUR')::numeric=5 and (data->>'consumptionMissing')::int>=1,'source price is preserved without retroactively pricing earlier use';
  assert (data->'expenses'->>'EUR')::numeric=10,'moving between stores does not generate another expense';
  assert (select count(*)=1 from boat_control.stockroom),'warehouse is not a vessel';
  assert not has_table_privilege('anon','boat_control.work_stock_costs','select'),'maintenance price snapshots stay private';
  missing=(data->>'consumptionMissing')::integer;
  -- Imported historical jobs have no reliable purchase price. They remain unvalued.
  update boat_control.boats set state=jsonb_set(jsonb_set(state,'{logs}',state->'logs'||jsonb_build_array(
    jsonb_build_object('id','prior-job','lines',jsonb_build_array(jsonb_build_object('productId',boat_item,'unit','kg','quantity',0.25))))),
    '{products}',(select jsonb_agg(case when x->>'id'=boat_item then jsonb_set(x,'{current}',to_jsonb((x->>'current')::numeric-0.25)) else x end)
      from jsonb_array_elements(state->'products') x)) where id=vessel;
  select state,revision into next_state,next_revision from boat_control.boats where id=vessel;
  next_state=jsonb_set(next_state,'{logs}',next_state->'logs'||jsonb_build_array(jsonb_build_object('id','new-job',
    'lines',jsonb_build_array(jsonb_build_object('productId',boat_item,'quantity',0.5)))));
  next_state=jsonb_set(next_state,'{products}',(select jsonb_agg(case when x->>'id'=boat_item then jsonb_set(x,'{current}',to_jsonb((x->>'current')::numeric-0.5)) else x end)
    from jsonb_array_elements(next_state->'products') x));
  perform public.boat_state_commit_rpc('test-only-operations',base||jsonb_build_object('state',next_state,'revision',next_revision,'key',gen_random_uuid()),'hash-of-job-qa');
  assert (select count(*)=1 from boat_control.work_stock_costs where boat_id=vessel and job_id='new-job' and product_id=boat_item and (price->>'amount')::numeric=2.5),'new job keeps historical price';
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert (data->'groceryConsumption'->>'EUR')::numeric=6.25 and (data->>'consumptionMissing')::integer=missing+1
   and (data->'usedUnits'->>'kg')::numeric=3.75,'stock and job usage include real quantities and only recorded costs';
  request=base||jsonb_build_object('session','ops-chef-session','key',gen_random_uuid(),'productId',boat_item,'quantity',0.1,'note','Consumo QA cocina');
  saved=public.boat_operations_rpc('test-only-operations','stock_consume',request);
  assert not saved ?|array['lastInvoiceUnitCost','cost','costKnown','costCurrency'] and saved ? 'current','chef sees balance without private prices';
  assert public.boat_operations_rpc('test-only-operations','stock_consume',request)=saved,'retry keeps the same private fields hidden';
  data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert (data->'groceryConsumption'->>'EUR')::numeric=6.5,'administrative history retains value of crew consumption';
  request=jsonb_build_object('operation','stock_consume','boat',vessel,'quantity',1);
  insert into boat_control.operation_receipts(user_id,key,request,result,created_at)
   values('ops-test-admin',gen_random_uuid(),request||'{"example":"before"}','{"area":"gastronomia","unit":"un","cost":3,"costKnown":true}',now()),
         ('ops-test-admin',gen_random_uuid(),request||'{"example":"after"}','{"area":"gastronomia","unit":"un","cost":4,"costKnown":true}',now());
  update boat_control.operation_receipts r set stock_currency=null where r.request->>'example'='before';
  update boat_control.boats set state=jsonb_set(state,'{boat,currency}','"ARS"') where id=vessel;
  saved=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
  assert (saved->'groceryConsumption'->>'USD')::numeric=4 and not (saved->'groceryConsumption' ? 'ARS')
     and (saved->>'consumptionMissing')::integer=(data->>'consumptionMissing')::integer+1,'changed boat currency never reprices historic usage';
  if to_regclass('boat_control.captain_cash_entries') is not null then
    insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by)
    values(vessel,'ops-test-admin','opening','USD',100,'Apertura de ensayo','ops-test-admin'),
          (vessel,'ops-test-admin','expense','USD',7,'Gasto de ensayo','ops-test-admin');
    data=public.boat_admin_stock_rpc('test-only-operations','warehouse_dashboard',base);
    assert (data->'captainExpenses'->>'USD')::numeric=7 and (data->'expenses'->>'EUR')::numeric=10,'opening excluded and cash expenditures reported separately';
  end if;
end $$;
