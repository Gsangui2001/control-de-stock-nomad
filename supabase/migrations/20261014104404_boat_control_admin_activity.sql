create or replace function boat_control.dispatch(server_key text, operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 u boat_control.accounts%rowtype; b boat_control.boats%rowtype;
 r text; v jsonb; x jsonb; photo_id uuid;
begin
 if not exists (select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if operation='seed' then
  perform pg_advisory_xact_lock(623104860);
  if exists(select 1 from boat_control.accounts) then raise exception 'Already initialized'; end if;
  for x in select * from jsonb_array_elements(payload->'users') loop
   insert into boat_control.accounts(id,name,username,password,admin) values(x->>'id',x->>'name',lower(x->>'username'),x->>'password',(x->>'admin')::boolean);
  end loop;
  for x in select * from jsonb_array_elements(payload->'boats') loop
   insert into boat_control.boats(id,name,state,revision) values(x->>'id',x->>'name',x->'state',coalesce((x->>'revision')::integer,0));
  end loop;
  for x in select * from jsonb_array_elements(coalesce(payload->'members','[]')) loop
   insert into boat_control.members values(x->>'user_id',x->>'boat_id',x->>'role');
  end loop;
  return jsonb_build_object('ok',true);
 elsif operation='account' then
  select * into u from boat_control.accounts where username=lower(payload->>'username');
  if not found then return 'null'::jsonb; end if;
  if u.locked_until>now() then raise exception 'Demasiados intentos. Esperá 10 minutos.' using errcode='P0001'; end if;
  return jsonb_build_object('id',u.id,'password',u.password);
 elsif operation='login_failure' then
  update boat_control.accounts set failures=case when locked_until<now() then 1 else failures+1 end,
   locked_until=case when failures>=4 then now()+interval '10 minutes' else locked_until end where username=lower(payload->>'username');
  return jsonb_build_object('ok',true);
 elsif operation='session_create' then
  delete from boat_control.sessions where expires<now();
  insert into boat_control.sessions values(payload->>'token',payload->>'user_id',now()+interval '24 hours');
  update boat_control.accounts set failures=0,locked_until=null where id=payload->>'user_id';
  return jsonb_build_object('ok',true);
 end if;
 select a.* into u from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if operation='session' then
  return jsonb_build_object('setup',false,'user',case when u.id is null then null else jsonb_build_object('id',u.id,'name',u.name,'admin',u.admin) end);
 end if;
 if u.id is null then raise exception 'Iniciá sesión para continuar.' using errcode='28000'; end if;
 if operation='logout' then
  delete from boat_control.sessions where token=payload->>'session'; return jsonb_build_object('ok',true);
 elsif operation='boats' then
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) order by a.name),'[]') into v from boat_control.boats a
   where u.admin or exists(select 1 from boat_control.members m where m.boat_id=a.id and m.user_id=u.id); return v;
 elsif operation='users' then
  if not u.admin then raise exception 'Solo el administrador puede gestionar accesos.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'username',a.username,'admin',a.admin,'boats',
    (select coalesce(jsonb_agg(jsonb_build_object('boat_id',m.boat_id,'role',m.role)),'[]') from boat_control.members m where m.user_id=a.id))),'[]') into v from boat_control.accounts a; return v;
 elsif operation='boat_create' then
  if not u.admin then raise exception 'Solo el administrador puede agregar barcos.' using errcode='42501'; end if;
  insert into boat_control.boats(id,name,state) values(payload->>'id',payload->>'name',payload->'state');
  return jsonb_build_object('id',payload->>'id','name',payload->>'name');
 end if;
 select * into b from boat_control.boats where id=payload->>'boat';
 if b.id is null then raise exception 'No se encontró el barco.' using errcode='P0002'; end if;
 r=case when u.admin then 'administrador' else (select role from boat_control.members where user_id=u.id and boat_id=b.id) end;
 if r is null then raise exception 'No tenés acceso a este barco.' using errcode='42501'; end if;
 if operation='state_get' then return jsonb_build_object('state',b.state,'revision',b.revision,'role',r);
 elsif operation='activity' then
  if not u.admin then raise exception 'Solo el administrador puede ver la actividad.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'revision',a.revision,'created_at',a.created_at,'actor',a.actor) order by a.id desc),'[]')
   into v
   from (
    select au.id,au.revision,au.created_at,ac.name as actor
    from boat_control.audit au
    join boat_control.accounts ac on ac.id=au.user_id
    where au.boat_id=b.id and au.user_id<>u.id
    order by au.id desc
    limit 20
   ) a;
  return v;
 elsif operation='photo_get' then
  select jsonb_build_object('data',data) into v from boat_control.photos where id=(payload->>'id')::uuid and boat_id=b.id;
  if v is null then raise exception 'Foto no encontrada.' using errcode='P0002'; end if; return v;
 end if;
 if r='lector' then raise exception 'Tu cuenta solo tiene permiso de lectura.' using errcode='42501'; end if;
 if operation='state_put' then
  if payload->'state'->>'schema'<>'1' or jsonb_typeof(payload->'state'->'products')<>'array' then raise exception 'Datos inválidos'; end if;
  update boat_control.boats set state=payload->'state',name=payload->'state'->'boat'->>'name',revision=revision+1
   where id=b.id and revision=(payload->>'revision')::integer returning * into b;
  if not found then raise exception 'Otra persona actualizó el barco. Recargá antes de guardar.' using errcode='PT409'; end if;
  insert into boat_control.audit(boat_id,user_id,revision) values(b.id,u.id,b.revision);
  return jsonb_build_object('state',b.state,'revision',b.revision);
 elsif operation='photo_put' then
  insert into boat_control.photos(boat_id,digest,data) values(b.id,payload->>'digest',payload->>'data') on conflict(boat_id,digest) do nothing;
  select id into photo_id from boat_control.photos where boat_id=b.id and digest=payload->>'digest';
  return jsonb_build_object('id',photo_id);
 elsif operation='user_create' then
  if not u.admin then raise exception 'Solo el administrador puede gestionar accesos.' using errcode='42501'; end if;
  insert into boat_control.accounts(id,name,username,password) values(payload->>'id',payload->>'name',lower(payload->>'username'),payload->>'password');
  insert into boat_control.members values(payload->>'id',b.id,payload->>'role');
  return jsonb_build_object('ok',true);
 elsif operation='access' then
  if not u.admin then raise exception 'Solo el administrador puede gestionar accesos.' using errcode='42501'; end if;
  if not exists(select 1 from boat_control.accounts where id=payload->>'user' and not admin) then raise exception 'Seleccioná una cuenta de tripulación.'; end if;
  delete from boat_control.members where user_id=payload->>'user' and boat_id=b.id;
  if payload->>'role'<>'sin_acceso' then insert into boat_control.members values(payload->>'user',b.id,payload->>'role'); end if;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operación inválida';
end $$;
