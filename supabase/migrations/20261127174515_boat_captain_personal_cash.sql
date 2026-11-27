-- Apply after the existing secured captain cash RPC and table are present.
-- No prior entries are changed or reclassified.
alter table boat_control.captain_cash_entries drop constraint captain_cash_entries_kind_check;
alter table boat_control.captain_cash_entries add constraint captain_cash_entries_kind_check check
 (kind in ('opening','expense','handover','personal_contribution','personal_withdrawal','personal_spend','personal_reimburse'));
CREATE OR REPLACE FUNCTION boat_control.captain_balances(b text, captain text)
 RETURNS TABLE(currency text, opening numeric, incoming numeric, spent numeric, balance numeric, handed_over numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with currencies as (
   select currency from boat_control.captain_cash_entries where boat_id=b and captain_id=captain
   union select 'USD'::text
 ), totals as (
   select c.currency,o.amount opening,
    money.incoming,money.review,
    coalesce((select sum(e.amount) from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain
      and e.currency=c.currency and e.kind in ('expense','personal_reimburse') and (o.id is null or e.id>o.id)),0) spent,
    coalesce((select sum(e.amount) from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain
      and e.currency=c.currency and e.kind='handover' and (o.id is null or e.id>o.id)),0) handed_over
   from currencies c left join boat_control.captain_cash_entries o on o.boat_id=b and o.captain_id=captain and o.currency=c.currency and o.kind='opening'
   cross join lateral (select coalesce(sum(r.amount) filter(where not r.reviewing),0) incoming,coalesce(bool_or(r.reviewing),false) review
     from boat_control.captain_receipts(b,captain) r where c.currency='USD' and not(r.reservation_id=any(coalesce(o.prior_receipts,'{}'::uuid[])))) money
 )
 select t.currency,t.opening,t.incoming,t.spent,case when not t.review then t.opening+t.incoming-t.spent-t.handed_over end,t.handed_over
 from totals t order by t.currency
$function$;

create function boat_control.captain_personal_totals(b text,captain text,unit text)
 returns table(contributed numeric, withdrawn numeric, personal_spent numeric, reimbursed numeric)
 language sql stable set search_path to '' as $function$
 select coalesce(sum(e.amount) filter(where e.kind='personal_contribution'),0),
   coalesce(sum(e.amount) filter(where e.kind='personal_withdrawal'),0),
   coalesce(sum(e.amount) filter(where e.kind='personal_spend'),0),
   coalesce(sum(e.amount) filter(where e.kind='personal_reimburse'),0)
 from boat_control.captain_cash_entries e
 where e.boat_id=b and e.captain_id=captain and e.currency=unit
   and e.kind in ('personal_contribution','personal_withdrawal','personal_spend','personal_reimburse')
$function$;
revoke all on function boat_control.captain_personal_totals(text,text,text) from public,anon,authenticated;

create function boat_control.captain_wallet_personal(server_key text,operation text,payload jsonb)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 b text:=payload->>'boat'; actor text; unit text:=payload->>'currency'; kind_ text:=payload->>'kind';
 memo text:=btrim(payload->>'concept'); amt numeric; request_key uuid; entry bigint;
 prior jsonb; response jsonb; req jsonb:=(payload-'session')||jsonb_build_object('operation',operation);
 opening_ numeric; available numeric; cash record;
begin
 if operation='captain_wallet' then
  -- The original query enforces server, authentication, boat and captain/admin authorization.
  response=boat_control.captain_cash(server_key,operation,payload);
  return jsonb_build_object('personalCashVersion',1,'wallets',coalesce((
    select jsonb_agg(w.wallet||jsonb_build_object(
      'personal',coalesce((select jsonb_agg(jsonb_build_object('currency',x.currency,
        'contributed',t.contributed,'withdrawn',t.withdrawn,'spent',t.personal_spent,'reimbursed',t.reimbursed) order by x.currency)
        from jsonb_array_elements(w.wallet->'balances') v cross join lateral (select v->>'currency' currency) x
        cross join lateral boat_control.captain_personal_totals(b,w.wallet->>'captainId',x.currency) t),'[]'::jsonb),
      'personalEntries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'currency',e.currency,'kind',e.kind,
        'amount',e.amount,'concept',e.concept,'at',e.recorded_at) order by e.id desc)
        from boat_control.captain_cash_entries e
        where e.boat_id=b and e.captain_id=w.wallet->>'captainId'
        and e.kind in ('personal_contribution','personal_withdrawal','personal_spend','personal_reimburse')),'[]'::jsonb))
      order by w.seq)
    from jsonb_array_elements(response->'wallets') with ordinality as w(wallet,seq)
  ),'[]'::jsonb));
 end if;
 if operation<>'captain_personal_movement' then raise exception 'Operación desconocida'; end if;
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.id into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if actor is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 if not exists(select 1 from boat_control.members m where m.boat_id=b and m.user_id=actor and m.role='capitan') then
  raise exception 'Solo el capitán registra movimientos de su propia plata.' using errcode='42501';
 end if;
 request_key=(payload->>'key')::uuid; amt=(payload->>'amount')::numeric;
 if request_key is null or unit is null or unit not in ('USD','EUR','ARS','PAB') or kind_ is null or
   kind_ not in ('personal_contribution','personal_withdrawal','personal_spend','personal_reimburse') or
   amt is null or amt<=0 or amt>1e9 or amt<>round(amt,2) or memo is null or length(memo) not between 1 and 140 then
  raise exception 'Revisá tipo, moneda, importe y detalle.';
 end if;
 -- Identical request and wallet lock order to the existing expense/receipt/handover path.
 perform pg_advisory_xact_lock(hashtextextended(actor||request_key::text,0));
 select r.request,r.result into prior,response from boat_control.operation_receipts r where r.user_id=actor and r.key=request_key;
 if found then
  if prior is distinct from req then raise exception 'Identificador reutilizado con otros datos' using errcode='PT409'; end if;
  return response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('captain-wallet:'||b||':'||actor||':'||unit,0));
 if kind_<>'personal_spend' then
  select t.opening,t.balance into opening_,available from boat_control.captain_balances(b,actor) t where t.currency=unit;
  if opening_ is null or available is null then
   raise exception 'Falta un saldo conciliado en %. Pedile a Administración que revise el conteo inicial y los cobros.',unit using errcode='PT409';
  end if;
 end if;
 select * into cash from boat_control.captain_personal_totals(b,actor,unit);
 if kind_='personal_withdrawal' and amt>cash.contributed-cash.withdrawn then
  raise exception 'El retiro supera la plata propia aportada que todavía está en caja.' using errcode='PT409';
 elsif kind_='personal_reimburse' and amt>least(available,cash.personal_spent-cash.reimbursed) then
  raise exception 'El reintegro supera lo pendiente o el efectivo disponible de Nomad.' using errcode='PT409';
 end if;
 insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by)
 values(b,actor,kind_,unit,amt,memo,actor) returning id into entry;
 response=jsonb_build_object('ok',true,'entryId',entry);
 insert into boat_control.operation_receipts(user_id,key,request,result) values(actor,request_key,req,response);
 return response;
end
$function$;
revoke all on function boat_control.captain_wallet_personal(text,text,jsonb) from public;
grant execute on function boat_control.captain_wallet_personal(text,text,jsonb) to anon,authenticated;

create or replace function public.boat_captain_cash_rpc(server_key text,operation text,payload jsonb)
 returns jsonb language sql set search_path to '' as $function$
 select case when operation='agenda' then boat_control.captain_agenda_preview(server_key,payload)
   when operation in ('captain_wallet','captain_personal_movement') then boat_control.captain_wallet_personal(server_key,operation,payload)
   else boat_control.captain_cash(server_key,operation,payload) end
$function$;
