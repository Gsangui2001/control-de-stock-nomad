-- A configurable reference, not a cash entry. The existing ledger is never written.
create table boat_control.captain_fixed_fund_revisions (
 boat_id text not null references boat_control.boats(id) on delete cascade,
 captain_id text not null references boat_control.accounts(id) on delete cascade,
 revision integer not null check(revision>0),
 currency text not null check(currency in ('USD','EUR','ARS','PAB')),
 amount numeric not null check(amount between 0 and 1000000000 and amount=round(amount,2)),
 updated_by text not null,
 updated_at timestamptz not null default now(),
 primary key(boat_id,captain_id,revision)
);
alter table boat_control.captain_fixed_fund_revisions enable row level security;
revoke all on table boat_control.captain_fixed_fund_revisions from public,anon,authenticated;

create function boat_control.captain_fixed_fund(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 b text:=payload->>'boat'; c text:=payload->>'id'; actor text;
 unit text:=payload->>'currency'; amt numeric; seen integer; actual integer; k uuid;
 req jsonb:=(payload-'session')||jsonb_build_object('operation',operation);
 wallet_data jsonb; prior jsonb; response jsonb;
begin
 if operation='captain_wallet' then
  -- Reuse the exact existing per-boat and per-captain wallet authorization.
  wallet_data:=public.boat_captain_cash_rpc(server_key,operation,payload);
  return jsonb_set(wallet_data,'{wallets}',coalesce((
   select jsonb_agg(w.item||jsonb_build_object('fixedFund',(
    select jsonb_build_object('amount',f.amount,'currency',f.currency,'revision',f.revision,'updatedAt',f.updated_at)
    from boat_control.captain_fixed_fund_revisions f where f.boat_id=b and f.captain_id=w.item->>'captainId'
    order by f.revision desc limit 1
   )) order by w.seq)
   from jsonb_array_elements(wallet_data->'wallets') with ordinality as w(item,seq)
  ),'[]'::jsonb));
 end if;
 if operation is distinct from 'captain_fixed_fund_set' then raise exception 'Operación desconocida'; end if;
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.id into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if actor is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 if not exists(select 1 from boat_control.accounts a where a.id=actor and a.admin) then
  raise exception 'Solo Administración puede configurar el fondo fijo.' using errcode='42501';
 end if;
 if not exists(select 1 from boat_control.members m join boat_control.boats v on v.id=m.boat_id
   where m.boat_id=b and m.user_id=c and m.role='capitan') then
  raise exception 'El capitán no está asignado a este barco.' using errcode='42501';
 end if;
 k:=(payload->>'key')::uuid; amt:=(payload->>'amount')::numeric; seen:=(payload->>'revision')::integer;
 if k is null or seen is null or seen<0 or unit is null or unit not in ('USD','EUR','ARS','PAB')
  or amt is null or amt<0 or amt>1e9 or amt<>round(amt,2) then raise exception 'Revisá el monto y la moneda.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor||k::text,0));
 select r.request,r.result into prior,response from boat_control.operation_receipts r where r.user_id=actor and r.key=k;
 if found then
  if prior is distinct from req then raise exception 'Identificador reutilizado con otros datos.' using errcode='PT409'; end if;
  return response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('captain-fixed-fund:'||b||':'||c,0));
 select coalesce(max(f.revision),0) into actual from boat_control.captain_fixed_fund_revisions f where f.boat_id=b and f.captain_id=c;
 if actual<>seen then raise exception 'El fondo fijo cambió. Actualizá la caja antes de editarlo.' using errcode='PT409'; end if;
 insert into boat_control.captain_fixed_fund_revisions(boat_id,captain_id,revision,currency,amount,updated_by)
 values(b,c,actual+1,unit,amt,actor);
 response:=jsonb_build_object('ok',true,'revision',actual+1,'amount',amt,'currency',unit,'captainId',c);
 insert into boat_control.operation_receipts(user_id,key,request,result) values(actor,k,req,response);
 return response;
end
$function$;
revoke all on function boat_control.captain_fixed_fund(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.captain_fixed_fund(text,text,jsonb) to anon,authenticated;

create function public.boat_captain_fixed_fund_rpc(server_key text, operation text, payload jsonb)
returns jsonb language sql set search_path='' as $function$
 select boat_control.captain_fixed_fund(server_key,operation,payload)
$function$;
revoke all on function public.boat_captain_fixed_fund_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.boat_captain_fixed_fund_rpc(text,text,jsonb) to anon,authenticated;
