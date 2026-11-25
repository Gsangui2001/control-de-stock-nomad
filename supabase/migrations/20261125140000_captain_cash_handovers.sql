-- Entregas de efectivo del capitán a Nomad.
-- Gerardo, 2026-11-25: «mientras cobra el capitán tiene que ir sumando y tener el control de lo que
-- hay, y cuando se entrega esa plata tiene que quedar registrado».
--
-- QUÉ CAMBIA
-- 1. `captain_cash_entries.kind` admite 'handover': el efectivo que el capitán le entrega a Nomad.
--    La regla existente del importe ya exige que sea mayor que cero en todo lo que no es conteo.
-- 2. `captain_balances` resta las entregas: conteo inicial + cobros − gastos − entregas.
--    `opening` y `balance` conservan sus nombres: el PR #365 del CRM (`settle_captain_payment`) los
--    lee por nombre con SQL dinámico. La columna nueva `handed_over` va al final. Como cambia el
--    tipo de retorno, la función se borra y se vuelve a crear con los mismos permisos.
-- 3. `captain_cash` suma la operación `captain_handover`. La registra administración al recibir el
--    efectivo: capitán, moneda, importe y nota opcional (hasta 140). No puede superar el saldo; si el
--    saldo es desconocido (falta el conteo inicial o hay un cobro en revisión), se rechaza. Es
--    idempotente por clave y toma el mismo lock que los gastos (`captain-wallet:<barco>:<capitán>:<moneda>`).
-- 4. En la misma transacción encola el aviso al grupo comercial de Telegram (`internal_alert_outbox`,
--    clave `captain-handover:<id de la entrada>`), en texto plano y sin nombres (Gerardo: «a capitán
--    nomás, que no diga nombre»). La nota no va al aviso: es texto libre y puede llevar nombres.
-- 5. `captain_wallet` devuelve las entregas de cada caja.
--
-- QUÉ NO CAMBIA
-- `boat_control.briefs` y `boat_control.settle_captain_payment` son del CRM y no se tocan. Los cobros
-- siguen saliendo de Finanzas (`captain_receipts`). El resto de `captain_cash` queda igual que en
-- 20261124202222_captain_personal_cash.

-- Sin `if exists`: si la restricción tuviera otro nombre, la migración tiene que fallar y no dejar
-- la regla vieja rechazando las entregas.
alter table boat_control.captain_cash_entries drop constraint captain_cash_entries_kind_check;
alter table boat_control.captain_cash_entries add constraint captain_cash_entries_kind_check
 check (kind in ('opening','expense','handover'));

-- «USD 1.680» / «USD 1.680,50». `,` y `.` en el patrón de `to_char` no dependen del idioma de la
-- base; se intercambian para escribirlo como en castellano. Nombre propio: `boat_control.usd_text`
-- es del PR del CRM y no está aplicado.
create function boat_control.captain_cash_money(currency text, amount numeric) returns text
language sql immutable set search_path='' as $$
 select currency||' '||regexp_replace(translate(to_char(round(amount,2),'FM999,999,999,990.00'),',.','.,'),',00$','')
$$;

drop function boat_control.captain_balances(text,text);
create function boat_control.captain_balances(b text,captain text)
returns table(currency text,opening numeric,incoming numeric,spent numeric,balance numeric,handed_over numeric)
language sql stable set search_path='' as $$
 with currencies as (
   select currency from boat_control.captain_cash_entries where boat_id=b and captain_id=captain
   union select 'USD'::text
 ), totals as (
   select c.currency,o.amount opening,
    money.incoming,money.review,
    coalesce((select sum(e.amount) from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain
      and e.currency=c.currency and e.kind='expense' and (o.id is null or e.id>o.id)),0) spent,
    coalesce((select sum(e.amount) from boat_control.captain_cash_entries e where e.boat_id=b and e.captain_id=captain
      and e.currency=c.currency and e.kind='handover' and (o.id is null or e.id>o.id)),0) handed_over
   from currencies c left join boat_control.captain_cash_entries o on o.boat_id=b and o.captain_id=captain and o.currency=c.currency and o.kind='opening'
   cross join lateral (select coalesce(sum(r.amount) filter(where not r.reviewing),0) incoming,coalesce(bool_or(r.reviewing),false) review
     from boat_control.captain_receipts(b,captain) r where c.currency='USD' and not(r.reservation_id=any(coalesce(o.prior_receipts,'{}'::uuid[])))) money
 )
 select t.currency,t.opening,t.incoming,t.spent,case when not t.review then t.opening+t.incoming-t.spent-t.handed_over end,t.handed_over
 from totals t order by t.currency
$$;

create or replace function boat_control.captain_cash(server_key text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor boat_control.accounts%rowtype; b text=payload->>'boat'; actor_role text; captain text; unit text=payload->>'currency';
 rid uuid; opportunity uuid; published boat_control.brief_versions%rowtype; instruction text; previous boolean;
 old_request jsonb; result jsonb; request_key uuid; req jsonb=(payload-'session')||jsonb_build_object('operation',operation);
 amt numeric; entry bigint; available numeric; reserved uuid[]; row_data jsonb; rows jsonb='[]'::jsonb; boat_label text;
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
      'handovers',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'currency',e.currency,'amount',e.amount,'concept',e.concept,'at',e.recorded_at,
            'receivedBy',coalesce(ra.name,'Administración')) order by e.id desc)
          from boat_control.captain_cash_entries e left join boat_control.accounts ra on ra.id=e.recorded_by
          where e.boat_id=b and e.captain_id=m.user_id and e.kind='handover'),'[]'::jsonb),
      'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.reservation_id,'guest',r.guest,'amount',r.amount,'currency','USD','at',r.recorded_at,'reviewing',r.reviewing) order by r.recorded_at desc)
          from boat_control.captain_receipts(b,m.user_id) r),'[]'::jsonb)) order by a.name,m.user_id)
     from boat_control.members m join boat_control.accounts a on a.id=m.user_id
     where m.boat_id=b and m.role='capitan' and (actor.admin or m.user_id=actor.id)),'[]'::jsonb));
 end if;
 if operation not in ('captain_opening','captain_expense','captain_handover') then raise exception 'Operación desconocida'; end if;
 if operation='captain_opening' then
   if not actor.admin then raise exception 'Solo administración carga el efectivo inicial' using errcode='42501'; end if;
   captain=payload->>'captainId';
 elsif operation='captain_handover' then
   if not actor.admin then raise exception 'Solo administración registra una entrega de efectivo.' using errcode='42501'; end if;
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
 elsif operation='captain_handover' then
   instruction=nullif(btrim(payload->>'note'),'');
   if amt<=0 then raise exception 'Indicá el importe entregado.'; end if;
   if length(instruction)>140 then raise exception 'La nota admite hasta 140 caracteres.'; end if;
   -- Read after the wallet lock: an expense or a CRM receipt for this captain and currency waits here.
   select t.balance,t.opening is not null into available,previous from boat_control.captain_balances(b,captain) t where t.currency=unit;
   if previous is not true then
     raise exception 'Falta el conteo inicial en % de este capitán. Registralo antes de la entrega.',unit using errcode='PT409';
   end if;
   if available is null then
     raise exception 'Hay un cobro en revisión en el CRM y no se sabe cuánto efectivo tiene el capitán. Resolvelo antes de registrar la entrega.' using errcode='PT409';
   end if;
   if amt>available then
     raise exception 'La entrega supera el efectivo que tiene el capitán (%).',boat_control.captain_cash_money(unit,available) using errcode='PT409';
   end if;
   insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by)
    values(b,captain,'handover',unit,amt,coalesce(instruction,'Entrega de efectivo'),actor.id) returning id into entry;
   boat_label=case when boat_control.is_nomade(b) then 'Nomade'
     else coalesce(nullif(btrim((select v.name from boat_control.boats v where v.id=b)),''),'barco') end;
   -- Plain text without names. The CRM worker sends it to the commercial Telegram group.
   insert into public.internal_alert_outbox(dedupe_key,channel,body,status,deliver_after)
   values('captain-handover:'||entry::text,'commercial_group',
     '📤 Entrega de efectivo · '||boat_label||E'\n'
     ||'El capitán entregó '||boat_control.captain_cash_money(unit,amt)||'.'||E'\n'
     ||'Queda en la caja del capitán: '||boat_control.captain_cash_money(unit,available-amt)||'.',
     'pending',statement_timestamp())
   on conflict(dedupe_key) do nothing;
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

revoke all on function boat_control.captain_cash_money(text,numeric),boat_control.captain_balances(text,text),boat_control.captain_cash(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function boat_control.captain_cash(text,text,jsonb) to anon,authenticated;
