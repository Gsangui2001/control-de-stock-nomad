-- Physical custody on board. Guest receipts remain in the CRM's Finance V2 ledger.
create table boat_control.captain_cash_entries (
 id bigint generated always as identity primary key,
 boat_id text not null references boat_control.boats(id),
 captain_id text not null references boat_control.accounts(id),
 kind text not null check (kind in ('opening','expense')),
 currency text not null check (currency in ('USD','EUR','ARS','PAB')),
 amount numeric(14,2) not null check (amount >= 0 and (kind = 'opening' or amount > 0)),
 concept text not null,
 recorded_by text not null references boat_control.accounts(id),
 recorded_at timestamptz not null default clock_timestamp(),
 -- An opening is a physical count. Do not add any receipts that were already recorded at that time.
 prior_receipts uuid[] not null default '{}'
);
create unique index captain_cash_one_opening on boat_control.captain_cash_entries(boat_id,captain_id,currency) where kind='opening';
create index captain_cash_entries_owner on boat_control.captain_cash_entries(boat_id,captain_id,id);
alter table boat_control.captain_cash_entries enable row level security;
revoke all on boat_control.captain_cash_entries from public,anon,authenticated;

create function boat_control.captain_assigned(b text, rid uuid, captain text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from boat_control.members m where m.boat_id=b and m.user_id=captain and m.role='capitan')
 and coalesce((select l.captain_id=captain from boat_control.reservation_links l where l.reservation_id=rid and l.boat_id=b),
   (select count(*)=1 from boat_control.members m where m.boat_id=b and m.role='capitan'))
$$;

create function boat_control.captain_receipts(b text, captain text)
returns table(reservation_id uuid,amount numeric,recorded_at timestamptz,guest text,reviewing boolean)
language sql stable set search_path='' as $$
 select p.reservation_id,t.amount_usd,p.reported_at,coalesce(v.snapshot->>'name','Huésped'),
        t.status<>'cleared' or public.finance_payment_review_pending(r.opportunity_id) or not public.finance_transaction_is_effective(t.id)
 from boat_control.brief_payment_reports p
 join boat_control.reservation_briefs f on f.reservation_id=p.reservation_id and f.boat_id=b
 join boat_control.brief_versions v on v.reservation_id=p.reservation_id and v.version=p.version
 join public.reservations r on r.id=p.reservation_id
 join public.finance_transactions t on t.provider_event_id='nomade-captain:'||p.reservation_id::text
      and t.opportunity_id=r.opportunity_id
 where p.reported_by=captain and t.kind='customer_payment' and t.status in ('cleared','reversed')
  and t.payment_method='cash' and t.account_label='Caja del capitán · Nomade'
$$;

create function boat_control.captain_balances(b text,captain text) returns table(currency text,opening numeric,incoming numeric,spent numeric,balance numeric)
language sql stable set search_path='' as $$
 with currencies as (
   select currency from boat_control.captain_cash_entries where boat_id=b and captain_id=captain
   union select 'USD'::text
 ), totals as (
   select c.currency,o.amount opening,
    money.incoming,money.review,
    coalesce((select sum(e.amount) from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain
      and e.currency=c.currency and e.kind='expense' and (o.id is null or e.id>o.id)),0) spent
   from currencies c left join boat_control.captain_cash_entries o on o.boat_id=b and o.captain_id=captain and o.currency=c.currency and o.kind='opening'
   cross join lateral (select coalesce(sum(r.amount) filter(where not r.reviewing),0) incoming,coalesce(bool_or(r.reviewing),false) review
     from boat_control.captain_receipts(b,captain) r where c.currency='USD' and not(r.reservation_id=any(coalesce(o.prior_receipts,'{}'::uuid[])))) money
 )
 select t.currency,t.opening,t.incoming,t.spent,case when not t.review then t.opening+t.incoming-t.spent end from totals t order by t.currency
$$;

create function boat_control.captain_cash(server_key text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor boat_control.accounts%rowtype; b text=payload->>'boat'; actor_role text; captain text; unit text=payload->>'currency';
 rid uuid; opportunity uuid; published boat_control.brief_versions%rowtype; instruction text; previous boolean;
 old_request jsonb; result jsonb; request_key uuid; req jsonb=(payload-'session')||jsonb_build_object('operation',operation);
 amt numeric; entry bigint; available numeric; reserved uuid[]; row_data jsonb; rows jsonb='[]'::jsonb;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
   raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 actor_role=case when actor.admin then 'administrador' else (select role from boat_control.members where boat_id=b and user_id=actor.id) end;
 if actor_role is null or not exists(select 1 from boat_control.boats where id=b) then raise exception 'Sin acceso al barco' using errcode='42501'; end if;

 if operation in ('reservations','agenda') then
   result=public.boat_briefs_rpc(server_key,operation,payload);
   if actor_role in ('chef','marinero') then
    return (select coalesce(jsonb_agg((r.item-'collection'-'reports'-'captainBalance'-'captainPayment'-'toCollectUsd'-'paid') #- '{details,captainCollection}' order by r.seq),'[]'::jsonb)
      from jsonb_array_elements(result) with ordinality as r(item,seq));
   end if;
   if actor_role<>'capitan' then return result; end if;
   for row_data in select value from jsonb_array_elements(result) loop
    rid=(row_data->>'id')::uuid;
    if not boat_control.captain_assigned(b,rid,actor.id)
       or exists(select 1 from boat_control.brief_payment_reports p where p.reservation_id=rid and p.reported_by<>actor.id) then
      row_data=(row_data-'captainBalance'-'captainPayment'-'toCollectUsd'-'paid') #- '{details,captainCollection}';
      row_data=row_data||jsonb_build_object('cashAssigned',false);
    elsif exists(select 1 from boat_control.collections c where c.reservation_id=rid and c.status<>'rechazado') then
      row_data=row_data-'toCollectUsd'||jsonb_build_object('cashLegacyReview',true);
    elsif operation='agenda' then
      select v.* into published from boat_control.reservation_briefs f join boat_control.brief_versions v on v.reservation_id=f.reservation_id and v.version=f.published_version where f.reservation_id=rid and f.boat_id=b;
      if published.snapshot->'details'->>'captainCollection' is distinct from 'collect' then row_data=row_data-'toCollectUsd'; end if;
    end if;
    rows=rows||jsonb_build_array(row_data);
   end loop;
   return rows;
 end if;
 if operation='collection_report' then
   if boat_control.is_nomade(b) then raise exception 'Registrá el efectivo recibido en la ficha publicada del huésped.' using errcode='42501'; end if;
   return public.boat_operations_rpc(server_key,operation,payload);
 end if;
 if operation='brief_payment' then
   if actor_role<>'capitan' or not boat_control.is_nomade(b) then raise exception 'Solo el capitán del Nomade registra este cobro.' using errcode='42501'; end if;
   rid=(payload->>'id')::uuid;
   request_key=(payload->>'key')::uuid;
   if rid is null or request_key is null then raise exception 'Falta identificador de operación'; end if;
   perform pg_advisory_xact_lock(hashtextextended(actor.id||request_key::text,0));
   -- The canonical operation and wallet expense claims both lock the request key first.
   -- Finance mutations take the opportunity lock before the reservation. Follow that same order.
   select opportunity_id into opportunity from public.reservations where id=rid;
   perform 1 from public.opportunities where id=opportunity for update;
   perform 1 from public.reservations where id=rid for update;
   perform 1 from boat_control.reservation_links where reservation_id=rid and boat_id=b for update;
   if not boat_control.captain_assigned(b,rid,actor.id) then raise exception 'El cobro pertenece a otro capitán o requiere asignación.' using errcode='42501'; end if;
   if exists(select 1 from boat_control.brief_payment_reports p where p.reservation_id=rid and p.reported_by<>actor.id) then
    raise exception 'Este cobro ya figura en otra caja.' using errcode='42501';
   end if;
   select exists(select 1 from boat_control.brief_payment_reports where reservation_id=rid) into previous;
   if not previous then
    if exists(select 1 from boat_control.collections c where c.reservation_id=rid and c.status<>'rechazado') then
      raise exception 'Ya existe un cobro anterior. Administración debe conciliarlo antes de cobrar nuevamente.' using errcode='PT409';
    end if;
    select v.* into published from boat_control.reservation_briefs f join boat_control.brief_versions v on v.reservation_id=f.reservation_id and v.version=f.published_version
     where f.reservation_id=rid and f.boat_id=b;
    if published.snapshot->'details'->>'captainCollection' is distinct from 'collect' then
      raise exception 'Carlota debe autorizar este cobro en la ficha publicada.' using errcode='42501';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('captain-wallet:'||b||':'||actor.id||':USD',0));
   end if;
   -- The canonical operation checks the live balance, approval and version, writes one immutable receipt
   -- per reservation, and posts the cash transaction to the CRM in this same transaction.
   return public.boat_briefs_rpc(server_key,operation,payload);
 end if;
 if operation='captain_wallet' then
   if not actor.admin and actor_role<>'capitan' then raise exception 'Caja personal no disponible' using errcode='42501'; end if;
   return jsonb_build_object('wallets',coalesce((select jsonb_agg(jsonb_build_object(
      'captainId',m.user_id,'name',a.name,'balances',(select jsonb_agg(to_jsonb(t) order by t.currency) from boat_control.captain_balances(b,m.user_id) t),
      'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'currency',e.currency,'amount',e.amount,'concept',e.concept,'at',e.recorded_at) order by e.id desc)
          from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=m.user_id and e.kind='expense'),'[]'::jsonb),
      'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.reservation_id,'guest',r.guest,'amount',r.amount,'currency','USD','at',r.recorded_at,'reviewing',r.reviewing) order by r.recorded_at desc)
          from boat_control.captain_receipts(b,m.user_id) r),'[]'::jsonb)) order by a.name,m.user_id)
     from boat_control.members m join boat_control.accounts a on a.id=m.user_id
     where m.boat_id=b and m.role='capitan' and (actor.admin or m.user_id=actor.id)),'[]'::jsonb));
 end if;
 if operation not in ('captain_opening','captain_expense') then raise exception 'Operación desconocida'; end if;
 if operation='captain_opening' then
   if not actor.admin then raise exception 'Solo administración carga el efectivo inicial' using errcode='42501'; end if;
   captain=payload->>'captainId';
 else
   if actor_role<>'capitan' then raise exception 'Solo el capitán registra un gasto propio.' using errcode='42501'; end if;
   captain=actor.id;
 end if;
 if not exists(select 1 from boat_control.members where boat_id=b and user_id=captain and role='capitan') then raise exception 'Capitán incorrecto' using errcode='42501'; end if;
 request_key=(payload->>'key')::uuid;
 if request_key is null then raise exception 'Falta identificador de operación'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id||request_key::text,0));
 select request,r.result into old_request,result from boat_control.operation_receipts r where user_id=actor.id and key=request_key;
 if found then if old_request<>req then raise exception 'Identificador reutilizado con otros datos' using errcode='PT409';end if;return result;end if;
 amt=(payload->>'amount')::numeric;
 if unit is null or unit not in ('USD','EUR','ARS','PAB') or amt is null or amt<0 or amt>1e9 or amt<>round(amt,2) then raise exception 'Revisá moneda e importe'; end if;
 perform pg_advisory_xact_lock(hashtextextended('captain-wallet:'||b||':'||captain||':'||unit,0));
 if operation='captain_opening' then
   if exists(select 1 from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain and e.currency=unit and e.kind='opening') then
     raise exception 'Esta moneda ya tiene un conteo inicial.' using errcode='PT409';
   end if;
   select coalesce(array_agg(r.reservation_id),'{}'::uuid[]) into reserved from boat_control.captain_receipts(b,captain) r where unit='USD';
   insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by,prior_receipts)
    values(b,captain,'opening',unit,amt,'Conteo inicial',actor.id,reserved) returning id into entry;
 else
   instruction=btrim(payload->>'concept');
   if amt<=0 or instruction is null or length(instruction) not between 1 and 140 then raise exception 'Indicá importe y concepto del gasto'; end if;
   select t.balance,t.opening is not null into available,previous from boat_control.captain_balances(b,captain) t where t.currency=unit;
   if previous and available is null then raise exception 'Hay un cobro en revisión. Verificá el efectivo con administración.' using errcode='PT409'; end if;
   if available is not null and amt>available then raise exception 'El gasto supera el efectivo registrado en esta moneda.' using errcode='PT409'; end if;
   insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by)
    values(b,captain,'expense',unit,amt,instruction,actor.id) returning id into entry;
 end if;
 result=jsonb_build_object('ok',true,'entryId',entry);
 insert into boat_control.operation_receipts(user_id,key,request,result) values(actor.id,request_key,req,result);
 return result;
end $$;
revoke all on function boat_control.captain_assigned(text,uuid,text),boat_control.captain_receipts(text,text),boat_control.captain_balances(text,text),boat_control.captain_cash(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.captain_cash(text,text,jsonb) to anon,authenticated;
create function public.boat_captain_cash_rpc(server_key text,operation text,payload jsonb) returns jsonb language sql set search_path='' as $$
 select boat_control.captain_cash(server_key,operation,payload)
$$;
revoke all on function public.boat_captain_cash_rpc(text,text,jsonb) from public;
grant execute on function public.boat_captain_cash_rpc(text,text,jsonb) to anon,authenticated;
