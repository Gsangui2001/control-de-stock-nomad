-- Land inventory is a fleet location, independent of boats and their memberships.
create table boat_control.stockroom (
 id boolean primary key default true check (id),
 name text not null check (length(trim(name)) between 1 and 140),
 products jsonb not null default '[]'::jsonb,
 movements jsonb not null default '[]'::jsonb,
 revision integer not null default 0
);
alter table boat_control.stockroom enable row level security;
revoke all on boat_control.stockroom from public, anon, authenticated;
insert into boat_control.stockroom(id,name) values(true,'Depósito');
create index boat_consumption_receipts_by_boat on boat_control.operation_receipts ((request->>'boat'),created_at)
where request->>'operation'='stock_consume';

-- The same positive matched row must be identified unambiguously even for legacy
-- duplicates. A new destination row is allowed only when there is no match.
create function boat_control.stockroom_match(items jsonb, template jsonb, place text, selected text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare matches jsonb;
begin
 select coalesce(jsonb_agg(x),'[]') into matches from jsonb_array_elements(items) x
 where coalesce(x->>'area','tecnica')=coalesce(template->>'area','tecnica')
 and lower(normalize(trim(x->>'name'),NFC))=lower(normalize(trim(template->>'name'),NFC))
 and lower(normalize(trim(x->>'unit'),NFC))=lower(normalize(trim(template->>'unit'),NFC))
 and lower(normalize(trim(x->>'location'),NFC))=lower(normalize(trim(place),NFC))
 and (selected is null or x->>'id'=selected);
 if selected is not null and jsonb_array_length(matches)=0 then raise exception 'La ficha ya no coincide con el destino. Actualizá el inventario.' using errcode='22023'; end if;
 if jsonb_array_length(matches)>1 then raise exception 'Hay varias fichas coincidentes. Seleccioná una ficha de destino.' using errcode='22023'; end if;
 return matches->0;
end $$;
revoke all on function boat_control.stockroom_match(jsonb,jsonb,text,text) from public,anon,authenticated;

create function boat_control.stockroom_price(product jsonb, default_currency text)
returns jsonb language sql immutable set search_path='' as $$
 select case
  when jsonb_typeof(product->'lastInvoiceUnitCost')='number' and product->>'costCurrency' in ('USD','ARS','EUR','PAB')
   then jsonb_build_object('amount',product->'lastInvoiceUnitCost','currency',product->>'costCurrency')
  when jsonb_typeof(product->'cost')='number' and (product->'costKnown'='true' or (product->'costKnown' is null and (product->>'cost')::numeric>0))
    and coalesce(product->>'costCurrency',default_currency) in ('USD','ARS','EUR','PAB')
   then jsonb_build_object('amount',product->'cost','currency',coalesce(product->>'costCurrency',default_currency))
  end
$$;
revoke all on function boat_control.stockroom_price(jsonb,text) from public,anon,authenticated;

-- Keep the boat currency valid at the moment of use, including for legacy
-- products that store their price in the boat currency without naming it.
alter table boat_control.operation_receipts add column stock_currency text;
create function boat_control.capture_stock_currency() returns trigger language plpgsql set search_path='' as $$
begin
 select b.state->'boat'->>'currency' into new.stock_currency from boat_control.boats b where b.id=new.request->>'boat';
 return new;
end $$;
revoke all on function boat_control.capture_stock_currency() from public,anon,authenticated;
create trigger capture_stock_currency before insert on boat_control.operation_receipts
 for each row when (new.request->>'operation'='stock_consume') execute function boat_control.capture_stock_currency();

-- Keep the reference price of each newly recorded job material private. An
-- old job with no contemporaneous evidence must never be priced at today's rate.
create table boat_control.work_stock_costs (
 boat_id text not null references boat_control.boats(id),
 job_id text not null, product_id text not null, area text, unit text,
 price jsonb, recorded_at timestamptz not null default now(),
 primary key(boat_id,job_id,product_id)
);
alter table boat_control.work_stock_costs enable row level security;
revoke all on boat_control.work_stock_costs from public,anon,authenticated;
create function boat_control.capture_work_stock_cost() returns trigger language plpgsql set search_path='' as $$
begin
 if current_setting('nomad.capture_work_stock_cost',true) is distinct from 'on' then return new; end if;
 insert into boat_control.work_stock_costs(boat_id,job_id,product_id,area,unit,price)
 select distinct on (job->>'id',p->>'id') new.id,job->>'id',p->>'id',coalesce(p->>'area','tecnica'),p->>'unit',
  boat_control.stockroom_price(p,old.state->'boat'->>'currency')
 from jsonb_array_elements(coalesce(new.state->'logs','[]')) job
 cross join lateral jsonb_array_elements(coalesce(job->'lines','[]')) line
 join jsonb_array_elements(coalesce(old.state->'products','[]')) p on p->>'id'=line->>'productId'
 where job->>'id' is not null and not exists(select 1 from jsonb_array_elements(coalesce(old.state->'logs','[]')) prev where prev->>'id'=job->>'id')
 on conflict do nothing;
 return new;
end $$;
revoke all on function boat_control.capture_work_stock_cost() from public,anon,authenticated;
create trigger capture_work_stock_cost after update of state on boat_control.boats
 for each row when ((old.state->'logs') is distinct from (new.state->'logs')) execute function boat_control.capture_work_stock_cost();

alter function boat_control.dispatch(text,text,jsonb) rename to dispatch_before_work_stock_cost;
revoke all on function boat_control.dispatch_before_work_stock_cost(text,text,jsonb) from public,anon,authenticated;
create function boat_control.dispatch(server_key text,operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior text; result jsonb;
begin
 if operation<>'state_put' then return boat_control.dispatch_before_work_stock_cost(server_key,operation,payload); end if;
 prior=current_setting('nomad.capture_work_stock_cost',true);
 perform set_config('nomad.capture_work_stock_cost','on',true);
 result=boat_control.dispatch_before_work_stock_cost(server_key,operation,payload);
 perform set_config('nomad.capture_work_stock_cost',coalesce(prior,'off'),true);
 return result;
end $$;
revoke all on function boat_control.dispatch(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.dispatch(text,text,jsonb) to anon,authenticated;

create function boat_control.admin_stock_data(vessel boat_control.boats)
returns jsonb language sql stable set search_path='' as $$
 with products as (select p from jsonb_array_elements(vessel.state->'products') p),
 purchases as (select e, e->>'currency' currency
   from jsonb_array_elements(coalesce(vessel.state->'purchases','[]')) e),
 purchased_lines as (
   select l, currency, coalesce(doc.data->'items'->((ord-1)::int)->>'area',l->>'area',p->>'area',
    case when p is not null then 'tecnica' end) area
   from purchases cross join lateral jsonb_array_elements(coalesce(e->'lines','[]')) with ordinality as lines(l,ord)
   left join products on p->>'id'=l->>'productId'
   left join boat_control.stock_intakes doc on doc.boat_id=vessel.id and doc.id::text=e->>'intakeId'
 ), consumption as (
   -- Receipts snapshot the product and quantity at the time of actual use.
   select coalesce(r.result->>'area','tecnica') area,(r.request->>'quantity')::numeric qty,
    boat_control.stockroom_price(r.result,r.stock_currency) price,r.result->>'unit' unit
   from boat_control.operation_receipts r where r.request->>'boat'=vessel.id and r.request->>'operation'='stock_consume'
   union all
   -- Job materials were deducted by the work log, separately from stock_consume.
   -- Legacy logs with no price must stay unvalued.
   select coalesce(c.area,l->>'area',p->>'area',case when p is not null then 'tecnica' end),(l->>'quantity')::numeric,
    case when c.job_id is not null then c.price when l ? 'cost' then boat_control.stockroom_price(l,l->>'currency') end,coalesce(l->>'unit',c.unit,p->>'unit')
   from jsonb_array_elements(coalesce(vessel.state->'logs','[]')) w
   cross join lateral jsonb_array_elements(coalesce(w->'lines','[]')) l left join products on p->>'id'=l->>'productId'
   left join boat_control.work_stock_costs c on c.boat_id=vessel.id and c.job_id=w->>'id' and c.product_id=l->>'productId'
 ), movements as (select m,n from jsonb_array_elements(coalesce(vessel.state->'movements','[]')) with ordinality as rows(m,n) order by n desc limit 100)
 select jsonb_build_object(
  'products',coalesce((select jsonb_agg(boat_control.inventory_shared_product(p) order by p->>'name') from products),'[]'),
  'movements',coalesce((select jsonb_agg(m order by n desc) from movements),'[]'),
  'movementCount',jsonb_array_length(coalesce(vessel.state->'movements','[]')),
  'expenses',coalesce((select jsonb_object_agg(currency,total) from (select currency,sum((e->>'total')::numeric) total from purchases
     where currency in('USD','ARS','EUR','PAB') and jsonb_typeof(e->'total')='number' group by currency) t),'{}'),
  'paid',coalesce((select jsonb_object_agg(currency,total) from (select currency,sum(amount) total from boat_control.expense_payments
     where boat_id=vessel.id and voided_at is null group by currency) t),'{}'),
  'expensesMissing',(select count(*) from purchases where coalesce(currency,'') not in('USD','ARS','EUR','PAB') or jsonb_typeof(e->'total') is distinct from 'number'),
  'groceryPurchases',coalesce((select jsonb_object_agg(currency,total) from (select currency,sum((l->>'quantity')::numeric*(l->>'cost')::numeric) total
     from purchased_lines where area='gastronomia' and currency in('USD','ARS','EUR','PAB') and jsonb_typeof(l->'cost')='number' and coalesce(l->>'costKnown','true')='true' group by currency) t),'{}'),
  'purchasesMissing', (select count(*) from purchased_lines where area='gastronomia' and (jsonb_typeof(l->'cost') is distinct from 'number' or l->>'costKnown'='false' or coalesce(currency,'') not in('USD','ARS','EUR','PAB'))),
  'unclassifiedPurchases',(select count(*) from purchased_lines where area is null),
  'groceryConsumption',coalesce((select jsonb_object_agg(currency,total) from (select price->>'currency' currency,sum(qty*(price->>'amount')::numeric) total
      from consumption where area='gastronomia' and price is not null group by price->>'currency') t),'{}'),
  'usedUnits',coalesce((select jsonb_object_agg(unit,qty) from (select unit,sum(qty) qty from consumption where area='gastronomia' and unit is not null group by unit) t),'{}'),
  'consumptionMissing',(select count(*) from consumption where area='gastronomia' and price is null),
  'unclassifiedConsumption',(select count(*) from consumption where area is null))
$$;
revoke all on function boat_control.admin_stock_data(boat_control.boats) from public,anon,authenticated;

create function boat_control.admin_stock(server_key text,operation text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor boat_control.accounts%rowtype; vessel boat_control.boats%rowtype; depot boat_control.stockroom%rowtype;
  request_key uuid; submitted jsonb; receipt boat_control.operation_receipts%rowtype;
  scope_id text=coalesce(payload->>'scope',payload->>'boat'); dest text=nullif(trim(payload->>'location'),'');
  prod jsonb; boat_prod jsonb; move jsonb; result jsonb; price jsonb; added jsonb; captain_expenses jsonb;
  amount numeric; delta numeric; balance numeric; title text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
   raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 if not actor.admin then raise exception 'Reservado a administración.' using errcode='42501'; end if;

 if operation='warehouse_dashboard' then
   select * into depot from boat_control.stockroom;
   if scope_id='depot' then
     result=jsonb_build_object('products',coalesce(depot.products,'[]'),
       'movements',coalesce((select jsonb_agg(m order by n desc) from (
          select m,n from jsonb_array_elements(depot.movements) with ordinality rows(m,n) order by n desc limit 100) latest),'[]'),
       'movementCount',jsonb_array_length(coalesce(depot.movements,'[]')));
   else
     select * into vessel from boat_control.boats where id=scope_id;
     if vessel.id is null then raise exception 'Barco inexistente' using errcode='22023'; end if;
     result=boat_control.admin_stock_data(vessel);
     -- A direct cash expense can refer to the same outlay as a supplier
     -- document. Report the separate source without summing across ledgers.
     if to_regclass('boat_control.captain_cash_entries') is not null then
       select coalesce(jsonb_object_agg(currency,total),'{}') into captain_expenses from (
        select ce.currency,sum(ce.amount) total from boat_control.captain_cash_entries ce
        where ce.boat_id=vessel.id and ce.kind='expense' group by ce.currency) totals;
       result=result||jsonb_build_object('captainExpenses',captain_expenses);
     end if;
   end if;
   return result || jsonb_build_object('scope',scope_id,'depot',depot.name,'depotRevision',depot.revision,
    'depotProducts',case when scope_id='depot' then '[]'::jsonb else coalesce(depot.products,'[]') end,
    'boats',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) order by b.name),'[]') from boat_control.boats b));
 end if;
 request_key=(payload->>'key')::uuid;
 if request_key is null then raise exception 'Falta identificar la operación' using errcode='22023'; end if;
 submitted=(payload-'session')||jsonb_build_object('operation',operation);
 perform pg_advisory_xact_lock(hashtextextended(actor.id||request_key::text,0));
 select * into receipt from boat_control.operation_receipts where user_id=actor.id and key=request_key;
 if found then
   if receipt.request<>submitted then raise exception 'Identificador reutilizado' using errcode='22023'; end if;
   return receipt.result;
 end if;
   select * into depot from boat_control.stockroom where id for update;
   amount=(payload->>'quantity')::numeric;
   if amount is null or amount<0 or amount>=1e9 or amount<>round(amount,4) then raise exception 'Cantidad inválida' using errcode='22023'; end if;
   if operation='warehouse_count' then
     if (payload->>'revision')::integer is distinct from depot.revision then raise exception 'Cambió el inventario del depósito. Revisá el conteo.' using errcode='40001'; end if;
     if coalesce(length(dest),0) not between 1 and 140 or coalesce(length(trim(payload->>'name')),0) not between 1 and 140
       or coalesce(length(trim(payload->>'unit')),0) not between 1 and 20 or coalesce(payload->>'area','') not in ('tecnica','gastronomia') then
        raise exception 'Completá artículo, unidad, tipo y ubicación' using errcode='22023'; end if;
     prod=boat_control.stockroom_match(depot.products,payload,dest,nullif(payload->>'productId',''));
     if prod is null then
       prod=jsonb_build_object('id',gen_random_uuid()::text,'name',trim(payload->>'name'),'unit',trim(payload->>'unit'),'area',payload->>'area','location',dest,'current',0);
     end if;
     if payload->>'unitCost' is not null then
       if (payload->>'unitCost')::numeric not between 0 and 1000000000 or coalesce(payload->>'currency','') not in ('USD','EUR','ARS','PAB') then
         raise exception 'Revisá el costo del comprobante y su moneda.' using errcode='22023'; end if;
       prod=prod||jsonb_build_object('lastInvoiceUnitCost',(payload->>'unitCost')::numeric,'costCurrency',payload->>'currency');
     end if;
     delta=amount-(prod->>'current')::numeric; title='Conteo físico';
   elsif operation='warehouse_transfer' then
     if amount<=0 or coalesce(length(dest),0) not between 1 and 140 or coalesce(payload->>'direction','') not in ('toBoat','toDepot') then
       raise exception 'Completá cantidad, sentido y ubicación' using errcode='22023'; end if;
     select * into vessel from boat_control.boats where id=payload->>'vessel' for update;
     if vessel.id is null then raise exception 'Barco inexistente' using errcode='22023'; end if;
     if payload->>'direction'='toBoat' then
       select x into prod from jsonb_array_elements(depot.products) x where x->>'id'=payload->>'productId';
       if prod is null or (prod->>'current')::numeric<amount then raise exception 'Sin existencias suficientes en el depósito' using errcode='22023'; end if;
       boat_prod=boat_control.stockroom_match(vessel.state->'products',prod,dest,nullif(payload->>'targetProductId',''));
       added=boat_control.stock_delta(vessel.id,coalesce(boat_prod,(prod-'id')||jsonb_build_object('location',dest)),amount,actor.id,'Transferencia desde depósito: '||depot.name);
       price=boat_control.stockroom_price(prod,null);
       if price is not null and boat_control.stockroom_price(boat_prod,vessel.state->'boat'->>'currency') is null then
         -- Copy a documented cost only into an unpriced destination. Transfers
         -- move stock and its reference cost; they never create a second expense.
         added=added||jsonb_build_object('lastInvoiceUnitCost',price->'amount','costCurrency',price->>'currency','costKnown',price->>'currency'=vessel.state->'boat'->>'currency',
            'cost',case when price->>'currency'=vessel.state->'boat'->>'currency' then (price->>'amount')::numeric else 0 end);
         update boat_control.boats b set state=jsonb_set(b.state,'{products}',(select jsonb_agg(case when x->>'id'=added->>'id' then added else x end order by n) from jsonb_array_elements(b.state->'products') with ordinality entries(x,n))) where b.id=vessel.id;
       end if;
       delta=-amount;title='Entrega a '||vessel.name;
     else
       select x into boat_prod from jsonb_array_elements(vessel.state->'products') x where x->>'id'=payload->>'productId';
       if boat_prod is null or (boat_prod->>'current')::numeric<amount then raise exception 'Sin existencias suficientes en el barco' using errcode='22023'; end if;
       prod=boat_control.stockroom_match(depot.products,boat_prod,dest,nullif(payload->>'targetProductId',''));
       if prod is null then
         prod=jsonb_build_object('id',gen_random_uuid()::text,'name',boat_prod->>'name','unit',boat_prod->>'unit',
          'area',coalesce(boat_prod->>'area','tecnica'),'location',dest,'current',0);
       end if;
       price=boat_control.stockroom_price(boat_prod,vessel.state->'boat'->>'currency');
       if price is not null and boat_control.stockroom_price(prod,null) is null then prod=prod||jsonb_build_object('lastInvoiceUnitCost',price->'amount','costCurrency',price->>'currency'); end if;
       perform boat_control.stock_delta(vessel.id,boat_prod,-amount,actor.id,'Transferencia al depósito: '||depot.name);
       delta=amount;title='Recepción de '||vessel.name;
     end if;
   else raise exception 'Operación desconocida' using errcode='22023'; end if;
   balance=(prod->>'current')::numeric+delta;
   if balance<0 or balance>=1e12 then raise exception 'El saldo quedaría fuera de rango' using errcode='22023'; end if;
   prod=prod||jsonb_build_object('current',balance);
   if exists(select 1 from jsonb_array_elements(depot.products) x where x->>'id'=prod->>'id') then
     select jsonb_agg(case when x->>'id'=prod->>'id' then prod else x end order by n) into depot.products
       from jsonb_array_elements(depot.products) with ordinality as rows(x,n);
   else depot.products=depot.products||jsonb_build_array(prod); end if;
   move=jsonb_build_object('id',request_key,'productId',prod->>'id','name',prod->>'name','unit',prod->>'unit',
      'delta',delta,'balance',balance,'date',current_date,'reason',title,'responsible',actor.name);
   update boat_control.stockroom set products=depot.products,movements=depot.movements||jsonb_build_array(move),revision=depot.revision+1 where id;
 result=jsonb_build_object('ok',true);
 insert into boat_control.operation_receipts values(actor.id,request_key,submitted,result,now());
 return result;
end $$;
revoke all on function boat_control.admin_stock(text,text,jsonb) from public,anon,authenticated;
create function public.boat_admin_stock_rpc(server_key text, operation text, payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select boat_control.admin_stock(server_key,operation,payload)$$;
revoke all on function public.boat_admin_stock_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.admin_stock(text,text,jsonb),public.boat_admin_stock_rpc(text,text,jsonb) to anon;

-- Boat restores already reject changes to transfer history. Include depot
-- transfers in that comparison, so an older boat backup cannot undo one leg.
alter function boat_control.backup_snapshot(text) rename to backup_snapshot_before_stockroom;
revoke all on function boat_control.backup_snapshot_before_stockroom(text) from public,anon,authenticated;
create function boat_control.backup_snapshot(b text) returns jsonb language sql stable set search_path='' as $$
 with existing as (select boat_control.backup_snapshot_before_stockroom(b) snapshot),
 depot_transfers as (
   select coalesce(jsonb_agg(jsonb_build_object('kind','warehouse_transfer','key',r.key,'direction',r.request->>'direction',
     'productId',r.request->>'productId','quantity',r.request->'quantity') order by r.created_at,r.key),'[]') additions
   from boat_control.operation_receipts r where r.request->>'operation'='warehouse_transfer' and r.request->>'vessel'=b)
 select jsonb_set(snapshot,'{transfers}',coalesce(snapshot->'transfers','[]')||additions) from existing,depot_transfers
$$;
revoke all on function boat_control.backup_snapshot(text) from public,anon,authenticated;
