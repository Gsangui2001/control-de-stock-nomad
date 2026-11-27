CREATE OR REPLACE FUNCTION boat_control.stockroom_package(server_key text, operation text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor boat_control.accounts%rowtype; depot boat_control.stockroom%rowtype; ship boat_control.stockroom_packages%rowtype;
 prior boat_control.operation_receipts%rowtype; vessel boat_control.boats%rowtype;
 b text=payload->>'boat'; member_role text; request jsonb; answer jsonb; k uuid; attachment uuid; signature uuid; ship_id uuid;
 normalized jsonb:='[]'; logs jsonb:='[]'; received_rows jsonb:='[]'; seen text[]:='{}';
 line jsonb; old_line jsonb; p jsonb; target jsonb; row_id text; loc text; note text;
 packs numeric; per_pack numeric; qty numeric; remaining numeric; balance numeric; status_after text;
 grams numeric; portions numeric; destination_name text; destination_unit text; destination_qty numeric; line_metadata jsonb;
begin
 if not exists(select 1 from boat_control.config where secret_hash=encode(extensions.digest(server_key,'sha256'),'hex')) then
  raise exception 'Servidor no autorizado' using errcode='42501';
 end if;
 select a.* into actor from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id where s.token=payload->>'session' and s.expires>now();
 if actor.id is null then raise exception 'Iniciá sesión' using errcode='28000'; end if;
 select name into vessel.name from boat_control.boats where id=b;
 select role into member_role from boat_control.members where boat_id=b and user_id=actor.id;
 if vessel.name is null or (actor.admin is distinct from true and coalesce(member_role,'') not in ('capitan','chef','marinero','encargado')) then
  raise exception 'Sin acceso a los paquetes de este barco.' using errcode='42501';
 end if;
 if operation='warehouse_package_list' then
  return (select coalesce(jsonb_agg(to_jsonb(rows) order by rows.sent_at desc),'[]') from (
    select sp.id,sp.boat_id,sp.sent_at,sp.sent_photo,sp.items,sp.status,coalesce(
      (select jsonb_agg(jsonb_build_object('photo',r.photo_id,'signature',r.signature_id,'signedBy',(select name from boat_control.accounts where id=r.received_by),'at',r.received_at,'items',r.items,'note',r.note,'verified',r.verified) order by r.received_at) from boat_control.stockroom_package_receipts r where r.package_id=sp.id),'[]') receipts
    from boat_control.stockroom_packages sp where sp.boat_id=b
    order by (sp.status<>'received') desc,sp.sent_at desc limit 100) rows);
 end if;
 if operation='warehouse_package_photo' then
  attachment=(payload->>'photo')::uuid;
  return to_jsonb(exists(select 1 from boat_control.stockroom_packages p where p.boat_id=b and (p.sent_photo=attachment or exists(
    select 1 from boat_control.stockroom_package_receipts r where r.package_id=p.id and (r.photo_id=attachment or r.signature_id=attachment)))));
 end if;
 if operation not in ('warehouse_package_send','warehouse_package_receive','warehouse_package_issue') then raise exception 'Operación desconocida' using errcode='22023'; end if;
 if operation='warehouse_package_send' and actor.admin is distinct from true then raise exception 'Solo Administración despacha desde Tierra.' using errcode='42501'; end if;
 k=(payload->>'key')::uuid; attachment=(payload->>'photo')::uuid;
 if k is null or not exists(select 1 from boat_control.photos where id=attachment and boat_id=b) then
  raise exception 'Adjuntá una foto del paquete correspondiente a este barco.' using errcode='22023';
 end if;
 if operation='warehouse_package_send' then
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'No se indicaron productos' using errcode='22023'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 50 then raise exception 'Incluí entre 1 y 50 productos.' using errcode='22023'; end if;
 elsif payload ? 'items' then
  raise exception 'Se firma el envío completo; no se vuelven a cargar sus cantidades.' using errcode='22023';
 end if;
 request=(payload-'session')||jsonb_build_object('operation',operation);
 perform pg_advisory_xact_lock(hashtextextended(actor.id||k::text,0));
 select * into prior from boat_control.operation_receipts where user_id=actor.id and key=k;
 if found then
  if prior.request is distinct from request then raise exception 'Identificador reutilizado.' using errcode='22023'; end if;
  return prior.result;
 end if;
 if operation='warehouse_package_send' then
  ship_id=gen_random_uuid();
  select * into strict depot from boat_control.stockroom where id for update;
  if depot.revision is distinct from (payload->>'revision')::int then raise exception 'Cambió el stock de Tierra. Revisá el paquete.' using errcode='40001'; end if;
  for line in select value from jsonb_array_elements(payload->'items') loop
   row_id=line->>'productId'; packs=(line->>'packs')::numeric; per_pack=(line->>'perPack')::numeric;
   qty=packs*per_pack;
   if row_id is null or row_id=any(seen) or packs is null or packs<=0 or packs<>trunc(packs) or packs>1000000 or
      per_pack is null or per_pack<=0 or per_pack<>round(per_pack,4) or qty>=1e9 then
    raise exception 'Revisá los productos, las fundas y las unidades por funda.' using errcode='22023';
   end if;
   seen=array_append(seen,row_id);
   select x into p from jsonb_array_elements(depot.products) x where x->>'id'=row_id;
   balance=(p->>'current')::numeric-qty;
   if p is null or balance is null or balance<0 then raise exception 'Stock insuficiente en Tierra para %.',coalesce(p->>'name','el producto') using errcode='22023'; end if;
   line_metadata='{}'::jsonb;
   if line ? 'portionGrams' then
    if coalesce(p->>'area','tecnica')<>'gastronomia' or lower(trim(p->>'unit'))<>'kg'
       or jsonb_typeof(line->'portionGrams') is distinct from 'number' then
      raise exception 'Solo se pueden porcionar productos gastronómicos registrados en kg.' using errcode='22023';
    end if;
    grams=(line->>'portionGrams')::numeric;
    if grams < 1 or grams > 5000 or trunc(grams)<>grams then
      raise exception 'Indicá entre 1 y 5.000 gramos enteros por porción.' using errcode='22023';
    end if;
    if mod(qty*1000,grams)<>0 then
      raise exception 'El peso no da porciones enteras. Ajustá el despacho y dejá el sobrante en Tierra.' using errcode='22023';
    end if;
    portions=qty*1000/grams;
    destination_name=(p->>'name')||' · '||trunc(grams)::text||' g por porción';
    if length(destination_name)>140 then raise exception 'Acortá el nombre del producto antes de porcionarlo.' using errcode='22023'; end if;
    line_metadata=jsonb_build_object('portionGrams',trunc(grams),'portions',trunc(portions),'destinationName',destination_name,'destinationUnit','porciones');
   end if;
   select jsonb_agg(case when x->>'id'=row_id then x||jsonb_build_object('current',balance) else x end order by n)
    into depot.products from jsonb_array_elements(depot.products) with ordinality entries(x,n);
   normalized=normalized||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'productId',row_id,'name',p->>'name','unit',p->>'unit',
    'area',coalesce(p->>'area','tecnica'),'sent',qty,'received',0,'packs',packs,'perPack',per_pack)||line_metadata);
   logs=logs||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'packageId',ship_id,'productId',row_id,'name',p->>'name','unit',p->>'unit',
    'delta',-qty,'balance',balance,'date',(now() at time zone 'America/Panama')::date,'reason','Paquete en camino a '||vessel.name,'responsible',actor.name));
  end loop;
  update boat_control.stockroom set products=depot.products,movements=depot.movements||logs,revision=depot.revision+1 where id;
  insert into boat_control.stockroom_packages(id,boat_id,sent_by,sent_photo,items) values(ship_id,b,actor.id,attachment,normalized);
  perform boat_control.stockroom_package_notify(b,actor.id,'package_dispatched',jsonb_build_object('packageId',ship_id,'boat',vessel.name));
  status_after='in_transit';
 else
  ship_id=(payload->>'id')::uuid;
  select * into ship from boat_control.stockroom_packages where id=ship_id and boat_id=b for update;
  if not found then raise exception 'Paquete inexistente para este barco.' using errcode='42501'; end if;
  if ship.status='received' then raise exception 'El paquete ya fue recibido.' using errcode='40001'; end if;
  if ship.sent_photo=attachment or exists(select 1 from boat_control.stockroom_package_receipts where package_id=ship_id and photo_id=attachment) then
   raise exception 'Adjuntá una foto nueva de lo recibido.' using errcode='22023';
  end if;
  note=coalesce(trim(payload->>'note'),'');
  if operation='warehouse_package_issue' then
   if length(note) not between 3 and 300 then raise exception 'Indicá brevemente qué no coincide.' using errcode='22023'; end if;
   status_after='review';
  else
   signature=(payload->>'signature')::uuid;
   if payload->'verified' is distinct from 'true'::jsonb or signature is null or signature in (attachment,ship.sent_photo)
     or not exists(select 1 from boat_control.photos where id=signature and boat_id=b)
     or exists(select 1 from boat_control.stockroom_package_receipts where package_id=ship_id and signature_id=signature) then
    raise exception 'Verificá las fotos y firmá la recepción completa.' using errcode='22023';
   end if;
   select * into strict vessel from boat_control.boats where id=b for update;
   normalized='[]';
   for old_line in select value from jsonb_array_elements(ship.items) loop
    qty=(old_line->>'sent')::numeric;
    destination_name=old_line->>'name';
    destination_unit=old_line->>'unit';
    destination_qty=qty;
    if old_line ? 'portionGrams' then
     grams=(old_line->>'portionGrams')::numeric;
     portions=(old_line->>'portions')::numeric;
     destination_name=old_line->>'destinationName';
     destination_unit=old_line->>'destinationUnit';
     if grams is null or grams<1 or grams>5000 or trunc(grams)<>grams
       or portions is null or portions<1 or trunc(portions)<>portions or portions*grams<>qty*1000
       or destination_name is distinct from ((old_line->>'name')||' · '||trunc(grams)::text||' g por porción')
       or destination_unit is distinct from 'porciones' or lower(trim(old_line->>'unit')) is distinct from 'kg' then
      raise exception 'La equivalencia de porciones no coincide con el despacho.' using errcode='22023';
     end if;
     destination_qty=portions;
    end if;
    select state into vessel.state from boat_control.boats where id=b;
    select case when count(*)=1 then (jsonb_agg(x)->0) end into target
     from jsonb_array_elements(vessel.state->'products') x
     where lower(normalize(trim(x->>'name'),NFC))=lower(normalize(trim(destination_name),NFC))
       and lower(normalize(trim(x->>'unit'),NFC))=lower(normalize(trim(destination_unit),NFC))
       and coalesce(x->>'area','tecnica')=coalesce(old_line->>'area','tecnica');
    loc=coalesce(nullif(target->>'location',''),'Recepción a bordo');
    p=old_line||jsonb_build_object('name',destination_name,'unit',destination_unit,'location',loc);
    target=coalesce(target,boat_control.stockroom_match(vessel.state->'products',p,loc,null));
    perform boat_control.stock_delta(b,coalesce(target,jsonb_build_object('name',destination_name,'unit',destination_unit,'area',old_line->>'area','location',loc)),
     destination_qty,actor.id,'Paquete recibido de Tierra · '||ship_id::text);
    normalized=normalized||jsonb_build_array(old_line||jsonb_build_object('received',qty)
      ||case when old_line ? 'portionGrams' then jsonb_build_object('receivedPortions',destination_qty) else '{}'::jsonb end);
    received_rows=received_rows||jsonb_build_array(jsonb_build_object('lineId',old_line->>'id','name',destination_name,'unit',destination_unit,'quantity',destination_qty,'location',loc)
      ||case when old_line ? 'portionGrams' then jsonb_build_object('sourceQty',qty,'sourceUnit',old_line->>'unit','portionGrams',grams) else '{}'::jsonb end);
   end loop;
   status_after='received';
  end if;
  insert into boat_control.stockroom_package_receipts(package_id,received_by,photo_id,signature_id,items,note,verified)
   values(ship_id,actor.id,attachment,signature,received_rows,note,status_after='received');
  update boat_control.stockroom_packages set items=coalesce(nullif(normalized,'[]'::jsonb),ship.items),status=status_after where id=ship_id;
  perform boat_control.stockroom_package_notify(b,actor.id,case when status_after='review' then 'package_issue' else 'package_received' end,
   jsonb_build_object('packageId',ship_id,'boat',vessel.name,'status',status_after));
 end if;
 answer=jsonb_build_object('ok',true,'id',ship_id,'status',status_after);
 insert into boat_control.operation_receipts(user_id,key,request,result,created_at) values(actor.id,k,request,answer,now());
 return answer;
end $function$;
