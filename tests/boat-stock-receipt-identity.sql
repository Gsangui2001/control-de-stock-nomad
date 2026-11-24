-- Run after boat-inventory-tickets-fleet.sql in its isolated transaction.
do $$
declare
  b text:='10000000000000000000000000000001'; key_text text:='inventory-fixture-key';
  base jsonb:=jsonb_build_object('boat',b,'session','inventory-admin-session');
  day date:=(now() at time zone 'America/Buenos_Aires')::date;
  data jsonb; req jsonb; source jsonb; res jsonb; doc jsonb; reviewed jsonb;
  n integer; v integer; i integer; ids text[]:=array[]::text[]; photo uuid; old_doc uuid; raw_hash text; refused boolean;
begin
  select jsonb_array_length(state->'purchases') into n from boat_control.boats where id=b;
  source:=jsonb_build_object('text','Jabón;2;un;Armario;5','photos','[]'::jsonb);
  data:=jsonb_build_object('supplier','Mayorista Sur','reference','A-010','date',day-1,'currency','USD','total',10,'notes','',
    'items',jsonb_build_array(jsonb_build_object('name','Jabón','quantity',2,'unit','un','area','tecnica','location','Armario','unitCost',5)));
  for i in 1..4 loop
    if i=2 then data:=data||jsonb_build_object('reference','A-011'); end if;
    if i=3 then data:=data||jsonb_build_object('supplier','Mayorista Norte'); end if;
    if i=4 then data:=data||jsonb_build_object('date',day); end if;
    select revision into v from boat_control.boats where id=b;
    req:=base||jsonb_build_object('key',gen_random_uuid(),'kind','purchase','confirmed',true,'revision',v,'source',source,'data',data);
    res:=public.boat_inventory_rpc(key_text,'ticket_confirm',req);
    assert res->>'status'='applied' and (res->>'id'<>all(ids)),'different number, supplier or date is a distinct invoice';
    ids:=array_append(ids,res->>'id');
    assert public.boat_inventory_rpc(key_text,'ticket_confirm',req)=res,'unchanged request replays';
  end loop;
  assert (select jsonb_array_length(state->'purchases') from boat_control.boats where id=b)=n+4,'four expenses for four invoices';
  assert (select (p->>'current')::numeric from boat_control.boats bb,lateral jsonb_array_elements(bb.state->'products') p where bb.id=b and p->>'name'='Jabón')=8,'four independent receipts credit stock only once';
  res:=public.boat_inventory_rpc(key_text,'ticket_confirm',req||jsonb_build_object('key',gen_random_uuid()));
  assert res->>'id'=ids[4] and res->>'alreadyApplied'='true','same commercial identity and source reuse original invoice';
  refused:=false;
  begin perform public.boat_inventory_rpc(key_text,'ticket_confirm',req||jsonb_build_object('key',gen_random_uuid(),'data',data||'{"reference":""}')); exception when sqlstate '22023' then refused:=true; end;
  assert refused,'missing invoice number cannot silently merge or repeat an identified text invoice';

  -- A row saved before this migration uses the old hash with no commercial suffix.
  source:=jsonb_build_object('text','Lista histórica con número confirmado','photos','[]'::jsonb);
  raw_hash:=encode(extensions.digest(source->>'text','sha256'),'hex');
  insert into boat_control.stock_intakes(boat_id,kind,source_hash,source,data,status,created_by)
    values(b,'purchase',raw_hash,source,data,'applied','inventory-fixture-admin') returning id into old_doc;
  res:=public.boat_inventory_rpc(key_text,'ticket_confirm',req||jsonb_build_object('key',gen_random_uuid(),'source',source));
  assert res->>'id'=old_doc::text and res->>'alreadyApplied'='true','old confirmed text invoice remains idempotent';

  -- Repeated photograph is the same document even if the fields are reread.
  insert into boat_control.photos(boat_id,digest,data) values(b,'qa-photo-identity', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+kL4kAAAAASUVORK5CYII=') returning id into photo;
  source:=jsonb_build_object('text','','photos',jsonb_build_array('/api/boat/photos?boat='||b||'&id='||photo::text));
  data:=data||jsonb_build_object('reference','FOTO-22');
  select revision into v from boat_control.boats where id=b;
  req:=req||jsonb_build_object('key',gen_random_uuid(),'revision',v,'source',source,'data',data);
  doc:=public.boat_inventory_rpc(key_text,'ticket_confirm',req);
  res:=public.boat_inventory_rpc(key_text,'ticket_confirm',req||jsonb_build_object('key',gen_random_uuid(),'data',data||'{"reference":"LECTURA-2"}'));
  assert res->>'id'=doc->>'id' and res->>'alreadyApplied'='true','identical invoice photograph returns its original receipt';

  ids:=array[]::text[];
  for i in 1..2 loop
    source:=jsonb_build_object('text','Tornillos;4;un;Caja de proa','photos','[]'::jsonb);
    data:=jsonb_build_object('date',day-3+i,'items',jsonb_build_array(jsonb_build_object('name','Tornillos','quantity',4,'unit','un','area','tecnica','location','Caja de proa')));
    doc:=public.boat_intake_rpc(key_text,'submit',base||jsonb_build_object('key',gen_random_uuid(),'kind','count','data',data,'source',source));
    assert doc->>'id'<>all(ids),'matching full count text on different physical dates creates distinct observations';
    ids:=array_append(ids,doc->>'id');
    select revision into v from boat_control.boats where id=b;
    reviewed:=base||jsonb_build_object('key',gen_random_uuid(),'id',doc->>'id','revision',v,'confirmed',true,'data',data);
    res:=public.boat_intake_rpc(key_text,'apply',reviewed);
    assert res->>'status'='applied' and public.boat_intake_rpc(key_text,'apply',reviewed)=res,'dated count applied and replayed';
  end loop;
  assert (select (p->>'current')::numeric from boat_control.boats bb,lateral jsonb_array_elements(bb.state->'products') p where bb.id=b and p->>'name'='Tornillos')=4,'repeated absolute count does not sum';
end $$;
