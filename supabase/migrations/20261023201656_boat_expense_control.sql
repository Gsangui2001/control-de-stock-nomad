create table boat_control.expense_controls (
 boat_id text not null references boat_control.boats(id), expense_id text not null,
 category text not null default '' check(category in ('','cocina','limpieza','mantenimiento','combustible','servicios','otros')),
 due_date date, notes text not null default '', reviewed boolean not null default false,
 expense_snapshot jsonb not null, version integer not null default 0,
 updated_by text not null references boat_control.accounts(id),updated_at timestamptz not null default now(),
 primary key(boat_id,expense_id)
);
create table boat_control.expense_payments (
 id uuid primary key default gen_random_uuid(),boat_id text not null,expense_id text not null,
 amount numeric(14,2) not null check(amount>0),currency text not null check(currency in ('USD','EUR','ARS','PAB')),
 paid_date date not null,payer text not null,method text not null check(method in ('efectivo','transferencia','tarjeta','otro')),
 reference text not null default '',notes text not null default '',photo text not null default '',fingerprint text not null,
 recorded_by text not null references boat_control.accounts(id),recorded_at timestamptz not null default now(),
 voided_by text references boat_control.accounts(id),voided_at timestamptz,void_reason text,
 foreign key(boat_id,expense_id) references boat_control.expense_controls(boat_id,expense_id),
 check((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(trim(void_reason))>=3))
);
create unique index expense_payments_active_fingerprint on boat_control.expense_payments(boat_id,expense_id,fingerprint) where voided_at is null;
create table boat_control.expense_history (
 id bigint generated always as identity primary key,boat_id text not null references boat_control.boats(id),expense_id text not null,
 actor_id text not null references boat_control.accounts(id),action text not null,detail jsonb not null,created_at timestamptz not null default now()
);
create index expense_history_boat on boat_control.expense_history(boat_id,expense_id,id);
alter table boat_control.expense_controls enable row level security;
alter table boat_control.expense_payments enable row level security;
alter table boat_control.expense_history enable row level security;
revoke all on boat_control.expense_controls,boat_control.expense_payments,boat_control.expense_history from public,anon,authenticated;

create function boat_control.expense_operation(server_key text,operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor boat_control.accounts%rowtype; vessel boat_control.boats%rowtype; member_role text;
 control boat_control.expense_controls%rowtype; payment boat_control.expense_payments%rowtype;
 expense jsonb; snapshot jsonb; previous jsonb; result jsonb; request_key uuid; expense_id_value text=payload->>'expenseId';
 total numeric; paid numeric; amount_value numeric; date_value date; currency_value text; fingerprint_value text;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501';end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000';end if;
 select * into vessel from boat_control.boats where id=payload->>'boat';
 member_role=case when actor.admin then 'administrador' else (select role from boat_control.members where boat_id=vessel.id and user_id=actor.id) end;
 if vessel.id is null or member_role is null then raise exception 'Sin acceso al barco' using errcode='42501';end if;
 if operation='list' then return jsonb_build_object('expenses',vessel.state->'purchases','currency',vessel.state->'boat'->>'currency',
  'controls',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from boat_control.expense_controls c where c.boat_id=vessel.id),
  'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('recorder',a.name) order by p.recorded_at),'[]') from boat_control.expense_payments p join boat_control.accounts a on a.id=p.recorded_by where p.boat_id=vessel.id),
  'history',(select coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('actor',a.name) order by h.id),'[]') from boat_control.expense_history h join boat_control.accounts a on a.id=h.actor_id where h.boat_id=vessel.id));end if;
 if not actor.admin and member_role<>'encargado' then raise exception 'Solo administración confirma gastos y pagos' using errcode='42501';end if;
 if operation not in ('review','payment','void') then raise exception 'Operación desconocida';end if;
 request_key=(payload->>'key')::uuid;if request_key is null then raise exception 'Falta identificador';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id||request_key::text,0));
 select request,r.result into previous,result from boat_control.operation_receipts r where user_id=actor.id and key=request_key;
 if found then if previous<>((payload-'session')||jsonb_build_object('operation','expense_'||operation)) then raise exception 'Identificador reutilizado';end if;return result;end if;
 select * into vessel from boat_control.boats where id=vessel.id for update;
 select p into expense from jsonb_array_elements(vessel.state->'purchases') p where p->>'id'=expense_id_value;
 if expense is null then raise exception 'Gasto inexistente';end if;
 total=(expense->>'total')::numeric;currency_value=coalesce(expense->>'currency',vessel.state->'boat'->>'currency');
 if total is null or total<0 or total>1e9 or total<>round(total,2) or currency_value not in ('USD','EUR','ARS','PAB') then raise exception 'Revisá importe y moneda del gasto antes de registrar pagos';end if;
 snapshot=jsonb_build_object('total',total,'currency',currency_value,'date',expense->>'date','supplier',expense->>'supplier','reference',expense->>'reference');
 select * into control from boat_control.expense_controls c where c.boat_id=vessel.id and c.expense_id=expense_id_value for update;
 if coalesce(control.version,0)<>(payload->>'version')::integer then raise exception 'Otro usuario actualizó el control. Actualizá y revisá antes de guardar.' using errcode='PT409';end if;
 if control.boat_id is null then
  insert into boat_control.expense_controls(boat_id,expense_id,expense_snapshot,updated_by) values(vessel.id,expense_id_value,snapshot,actor.id) returning * into control;
 end if;
 select coalesce(sum(p.amount),0) into paid from boat_control.expense_payments p where p.boat_id=vessel.id and p.expense_id=expense_id_value and p.voided_at is null;
 if operation='review' then
  if payload->>'confirmed'<>'true' or payload->>'category' not in ('','cocina','limpieza','mantenimiento','combustible','servicios','otros') then raise exception 'Revisá y confirmá el gasto';end if;
  if paid>total or exists(select 1 from boat_control.expense_payments p where p.boat_id=vessel.id and p.expense_id=expense_id_value and p.voided_at is null and p.currency<>currency_value) then raise exception 'El gasto no coincide con los pagos. Corregí los registros antes de confirmar.';end if;
  update boat_control.expense_controls set category=payload->>'category',due_date=nullif(payload->>'dueDate','')::date,notes=coalesce(payload->>'notes',''),reviewed=true,expense_snapshot=snapshot where boat_id=vessel.id and expense_id=expense_id_value;
 elsif operation='payment' then
  if control.expense_snapshot<>snapshot then raise exception 'El gasto cambió. Revisá su importe y moneda antes de cargar otro pago.';end if;
  amount_value=(payload->>'amount')::numeric;date_value=(payload->>'date')::date;
  if payload->>'confirmed'<>'true' or amount_value is null or amount_value<=0 or amount_value>1e9 or amount_value<>round(amount_value,2) or date_value is null or date_value>(now() at time zone 'America/Buenos_Aires')::date or nullif(trim(payload->>'payer'),'') is null or payload->>'method' not in ('efectivo','transferencia','tarjeta','otro') or payload->>'currency'<>currency_value then raise exception 'Confirmá importe, moneda, fecha, quién pagó y medio de pago reales';end if;
  if paid+amount_value>total then raise exception 'El pago supera el saldo del comprobante';end if;
  if coalesce(payload->>'photo','')<>'' and not exists(select 1 from boat_control.photos ph where ph.boat_id=vessel.id and '/api/boat/photos?boat='||vessel.id||'&id='||ph.id::text=payload->>'photo') then raise exception 'Comprobante de pago no disponible para este barco';end if;
  fingerprint_value=encode(extensions.digest(jsonb_build_array(amount_value,date_value,currency_value,lower(trim(payload->>'payer')),payload->>'method',lower(trim(coalesce(payload->>'reference',''))))::text,'sha256'),'hex');
  if exists(select 1 from boat_control.expense_payments p where p.boat_id=vessel.id and p.expense_id=expense_id_value and p.fingerprint=fingerprint_value and p.voided_at is null) then raise exception 'Ya hay un pago con esos datos. Revisá el historial para evitar duplicarlo.';end if;
  insert into boat_control.expense_payments(boat_id,expense_id,amount,currency,paid_date,payer,method,reference,notes,photo,fingerprint,recorded_by)
  values(vessel.id,expense_id_value,amount_value,currency_value,date_value,trim(payload->>'payer'),payload->>'method',coalesce(payload->>'reference',''),coalesce(payload->>'notes',''),coalesce(payload->>'photo',''),fingerprint_value,actor.id) returning * into payment;
 else
  select * into payment from boat_control.expense_payments p where p.id=(payload->>'paymentId')::uuid and p.boat_id=vessel.id and p.expense_id=expense_id_value for update;
  if payment.id is null or payment.voided_at is not null or length(trim(coalesce(payload->>'reason','')))<3 then raise exception 'Seleccioná un pago vigente y explicá la corrección';end if;
  update boat_control.expense_payments set voided_by=actor.id,voided_at=now(),void_reason=trim(payload->>'reason') where id=payment.id;
  -- A correction reopens the review; a void is not a refund or a bank operation.
  update boat_control.expense_controls set reviewed=false where boat_id=vessel.id and expense_id=expense_id_value;
 end if;
 update boat_control.expense_controls set version=version+1,updated_by=actor.id,updated_at=now() where boat_id=vessel.id and expense_id=expense_id_value returning * into control;
 insert into boat_control.expense_history(boat_id,expense_id,actor_id,action,detail) values(vessel.id,expense_id_value,actor.id,operation,(payload-'session'-'key')||jsonb_build_object('paymentId',payment.id));
 result=jsonb_build_object('ok',true,'version',control.version,'paymentId',payment.id);
 insert into boat_control.operation_receipts values(actor.id,request_key,(payload-'session')||jsonb_build_object('operation','expense_'||operation),result,now());
 return result;
end $$;
create function public.boat_expenses_rpc(server_key text,operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select boat_control.expense_operation(server_key,operation,payload) $$;
revoke all on function boat_control.expense_operation(text,text,jsonb),public.boat_expenses_rpc(text,text,jsonb) from public,authenticated;
grant execute on function boat_control.expense_operation(text,text,jsonb),public.boat_expenses_rpc(text,text,jsonb) to anon;

create or replace function boat_control.backup_snapshot(b text) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('version',1,'boat',b,'revision',bb.revision,'state',bb.state,
 'expenseControls',(select coalesce(jsonb_agg(to_jsonb(x) order by x.expense_id),'[]') from boat_control.expense_controls x where x.boat_id=b),
 'expensePayments',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from boat_control.expense_payments x where x.boat_id=b),
 'expenseHistory',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from boat_control.expense_history x where x.boat_id=b),
 'intakes',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from boat_control.stock_intakes i where i.boat_id=b),
 'requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from boat_control.requests q where q.boat_id=b),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from boat_control.transfers t where t.source_id=b or t.target_id=b),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.reservation_id),'[]') from boat_control.reservation_links l where l.boat_id=b),
 'instructions',(select coalesce(jsonb_agg(to_jsonb(c) order by c.reservation_id),'[]') from boat_control.collection_instructions c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'collections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from boat_control.collections c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'photos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from boat_control.photos p where p.boat_id=b)) from boat_control.boats bb where bb.id=b;
$$;
create or replace function boat_control.backup_operation(server_key text,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u text; b text=payload->>'boat'; snapshot jsonb; saved jsonb=payload->'backup'; key_id uuid; old_request jsonb; result jsonb; section text; record_row jsonb; revision_now integer; begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then raise exception 'Servidor no autorizado' using errcode='42501'; end if;
 select a.id into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now() and a.admin;
 if u is null then raise exception 'Solo administración' using errcode='42501'; end if;
 select revision into revision_now from boat_control.boats where id=b for update;
 if not found then raise exception 'Barco inexistente'; end if;
 snapshot=boat_control.backup_snapshot(b);
 if operation='backup' then return snapshot; end if;
 if operation<>'backup_restore' then raise exception 'Operación desconocida'; end if;
 key_id=(payload->>'key')::uuid;if key_id is null then raise exception 'Falta identificador'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u||key_id::text,0));
 select request,receipt.result into old_request,result from boat_control.operation_receipts receipt where user_id=u and key=key_id;
 if found then
  if old_request<>jsonb_build_object('backupHash',encode(extensions.digest(saved::text,'sha256'),'hex'),'boat',b) then raise exception 'Identificador reutilizado'; end if;
  return result;
 end if;
 if saved->>'version'<>'1' or saved->>'boat'<>b or revision_now<>(payload->>'revision')::integer then raise exception 'Respaldo de otro barco o datos cambiados. Actualizá antes de restaurar.' using errcode='PT409'; end if;
 foreach section in array array['transfers','reservations','instructions','collections'] loop
  if saved->section is distinct from snapshot->section then raise exception 'Hay cambios posteriores en transferencias, reservas o cobros. Conservamos esos registros: se necesita una recuperación coordinada.'; end if;
 end loop;
 if coalesce(saved->'intakes','[]'::jsonb) is distinct from snapshot->'intakes' then raise exception 'Hay cargas de stock o gastos posteriores al respaldo. Se necesita una recuperación coordinada para conservar su historial.';end if;
 foreach section in array array['expenseControls','expensePayments','expenseHistory'] loop
  if coalesce(saved->section,'[]'::jsonb) is distinct from snapshot->section then raise exception 'Hay revisiones o pagos posteriores al respaldo. Conservamos el historial: se necesita una recuperación coordinada.';end if;
 end loop;
 if jsonb_array_length(snapshot->'expenseControls')>0 and saved->'state'->'purchases' is distinct from snapshot->'state'->'purchases' then raise exception 'El respaldo cambiaría gastos con control de pagos. Se necesita una recuperación coordinada.';end if;
 if saved->'state'->>'schema'<>'1' or length(saved->'state'->'boat'->>'name')=0 then raise exception 'Estado inválido'; end if;
 foreach section in array array['products','tasks','logs','movements','purchases','cameras'] loop
  if jsonb_typeof(saved->'state'->section)<>'array' then raise exception 'Estado inválido'; end if;
 end loop;
 for record_row in select x from jsonb_array_elements(saved->'state'->'products') x loop
  if (record_row->>'current')::numeric<0 or (record_row->>'min')::numeric<0 or (record_row->>'cost')::numeric<0 then raise exception 'Stock inválido'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(saved->'requests') q where q->>'boat_id'<>b) or exists(select 1 from jsonb_array_elements(saved->'photos') p where p->>'boat_id'<>b) then raise exception 'El respaldo contiene datos de otro barco'; end if;
 insert into boat_control.backup_versions(boat_id,snapshot,actor_id) values(b,snapshot,u);
 delete from boat_control.requests where boat_id=b;
 insert into boat_control.requests select * from jsonb_populate_recordset(null::boat_control.requests,saved->'requests');
 insert into boat_control.photos select * from jsonb_populate_recordset(null::boat_control.photos,saved->'photos') on conflict(id) do nothing;
 update boat_control.boats set state=saved->'state',name=saved->'state'->'boat'->>'name',revision=revision+1 where id=b returning revision into revision_now;
 insert into boat_control.audit(boat_id,user_id,revision) values(b,u,revision_now);
 perform boat_control.emit_event(b,u,'respaldo_restaurado');
 result=jsonb_build_object('ok',true,'revision',revision_now);
 insert into boat_control.operation_receipts values(u,key_id,jsonb_build_object('backupHash',encode(extensions.digest(saved::text,'sha256'),'hex'),'boat',b),result,now());
 return result;
end $$;
