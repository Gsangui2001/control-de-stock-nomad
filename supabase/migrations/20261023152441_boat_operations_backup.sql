create table boat_control.backup_versions(id uuid primary key default gen_random_uuid(),boat_id text not null references boat_control.boats(id),snapshot jsonb not null,actor_id text not null references boat_control.accounts(id),created_at timestamptz not null default now());
alter table boat_control.backup_versions enable row level security;
revoke all on boat_control.backup_versions from public,anon,authenticated;
create function boat_control.backup_snapshot(b text) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('version',1,'boat',b,'revision',bb.revision,'state',bb.state,
 'requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from boat_control.requests q where q.boat_id=b),
 'transfers',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from boat_control.transfers t where t.source_id=b or t.target_id=b),
 'reservations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.reservation_id),'[]') from boat_control.reservation_links l where l.boat_id=b),
 'instructions',(select coalesce(jsonb_agg(to_jsonb(c) order by c.reservation_id),'[]') from boat_control.collection_instructions c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'collections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from boat_control.collections c join boat_control.reservation_links l on l.reservation_id=c.reservation_id where l.boat_id=b),
 'photos',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from boat_control.photos p where p.boat_id=b)) from boat_control.boats bb where bb.id=b;
$$;
create function boat_control.backup_operation(server_key text,operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.boat_backup_rpc(server_key text,operation text,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select boat_control.backup_operation(server_key,operation,payload) $$;
revoke all on function boat_control.backup_snapshot(text) from public,anon,authenticated;
revoke all on function boat_control.backup_operation(text,text,jsonb),public.boat_backup_rpc(text,text,jsonb) from public,authenticated;
grant execute on function boat_control.backup_operation(text,text,jsonb),public.boat_backup_rpc(text,text,jsonb) to anon;
