-- The operational ledger retains the invoiced value, including on idempotent
-- replays. Only administrators receive financial fields in these two responses.
create or replace function public.boat_operations_rpc(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  result jsonb;
  private_fields constant text[] := array['cost','costKnown','costCurrency','lastInvoiceUnitCost'];
begin
  result := boat_control.operations(server_key,operation,payload);
  if operation not in ('stock_consume','overview') then return result; end if;
  if public.boat_control_rpc(server_key,'session',jsonb_build_object('session',payload->>'session')) #>> '{user,admin}' = 'true' then
    return result;
  end if;
  if operation = 'stock_consume' then return result - private_fields; end if;
  return jsonb_set(result,'{fleet}',(
    select coalesce(jsonb_agg(jsonb_set(b,'{products}',(
      select coalesce(jsonb_agg(p - private_fields order by product_order),'[]'::jsonb)
      from jsonb_array_elements(b->'products') with ordinality as product(p,product_order)
    )) order by boat_order),'[]'::jsonb)
    from jsonb_array_elements(result->'fleet') with ordinality as boat(b,boat_order)
  ));
end
$$;
