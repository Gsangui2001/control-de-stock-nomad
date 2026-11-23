-- Run together with the migration inside BEGIN / ROLLBACK. No real stock changes.
update boat_control.config set secret_hash=encode(extensions.digest('inventory-fixture-key','sha256'),'hex');
insert into boat_control.accounts(id,name,username,password,admin) values
 ('inventory-fixture-admin','Inventory QA','inventory-fixture-admin','unused',true),
 ('inventory-fixture-chef','Chef QA','inventory-fixture-chef','unused',false),
 ('inventory-fixture-reader','Reader QA','inventory-fixture-reader','unused',false),
 ('inventory-fixture-captain','Captain QA','inventory-fixture-captain','unused',false),
 ('inventory-fixture-sailor','Sailor QA','inventory-fixture-sailor','unused',false),
 ('inventory-fixture-manager','Manager QA','inventory-fixture-manager','unused',false);
insert into boat_control.sessions(token,user_id,expires) values
 ('inventory-admin-session','inventory-fixture-admin',now()+interval '1 hour'),
 ('inventory-chef-session','inventory-fixture-chef',now()+interval '1 hour'),
 ('inventory-reader-session','inventory-fixture-reader',now()+interval '1 hour'),
 ('inventory-captain-session','inventory-fixture-captain',now()+interval '1 hour'),
 ('inventory-sailor-session','inventory-fixture-sailor',now()+interval '1 hour'),
 ('inventory-manager-session','inventory-fixture-manager',now()+interval '1 hour');
insert into boat_control.boats(id,name,state) values
 ('10000000000000000000000000000001','Inventory fixture A','{"schema":1,"boat":{"name":"QA A","currency":"USD","equipment":[]},"products":[],"tasks":[],"logs":[],"purchases":[],"movements":[],"cameras":[]}'),
 ('10000000000000000000000000000002','Inventory fixture B','{"schema":1,"boat":{"name":"QA B","currency":"USD","equipment":[]},"products":[{"id":"filter-fixture","name":"Filtro aceite","area":"tecnica","unit":"un","current":3,"location":"Pañol","code":"F-123","cost":999,"supplier":"PRIVATE","photo":"PRIVATE"}],"tasks":[],"logs":[],"purchases":[],"movements":[],"cameras":[{"url":"PRIVATE"}]}');
insert into boat_control.members values
 ('inventory-fixture-chef','10000000000000000000000000000001','chef'),
 ('inventory-fixture-reader','10000000000000000000000000000001','lector'),
 ('inventory-fixture-reader','10000000000000000000000000000002','lector'),
 ('inventory-fixture-captain','10000000000000000000000000000001','capitan'),
 ('inventory-fixture-captain','10000000000000000000000000000002','lector'),
 ('inventory-fixture-sailor','10000000000000000000000000000001','marinero'),
 ('inventory-fixture-manager','10000000000000000000000000000001','encargado');
do $$
declare b text='10000000000000000000000000000001'; other text='10000000000000000000000000000002';
 base jsonb; req jsonb; result jsonb; fleet jsonb; item jsonb; pid text; rev integer; failed boolean; before_count integer; crew text;
begin
 base=jsonb_build_object('boat',b,'session','inventory-admin-session');
 select revision into rev from boat_control.boats where id=b;
 req=base||jsonb_build_object('key',gen_random_uuid(),'kind','purchase','confirmed',true,'revision',rev,
 'source',jsonb_build_object('text','QA ticket 001','photos','[]'::jsonb),
 'data',jsonb_build_object('date',(now() at time zone 'America/Buenos_Aires')::date,'supplier','QA proveedor','reference','QA-001','currency','USD','total',40,'notes','',
 'items',jsonb_build_array(
  jsonb_build_object('name','Agua 500 ml','quantity',24,'unit','botellas','area','gastronomia','location','Bodega','unitCost',1,'productId',''),
  jsonb_build_object('name','Arroz','quantity',4,'unit','kg','area','gastronomia','location','Despensa','unitCost',4,'productId',''))));
 result=public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req);
 assert result->>'status'='applied','ticket confirmed';
 assert public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req)=result,'lost-response retry';
 perform public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req||jsonb_build_object('key',gen_random_uuid()));
 assert (select jsonb_array_length(state->'purchases') from boat_control.boats where id=b)=1,'one expense';
 assert (select jsonb_array_length(state->'movements') from boat_control.boats where id=b)=2,'one movement per row';
 select p into item from boat_control.boats bb cross join lateral jsonb_array_elements(bb.state->'products') p where bb.id=b and p->>'name'='Agua 500 ml';
 pid=item->>'id';assert (item->>'current')::numeric=24,'ticket increased stock once';
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',jsonb_set(req,'{data,total}','41'));exception when others then failed=true;end;assert failed,'key bound to payload';
 req=base||jsonb_build_object('session','inventory-chef-session','key',gen_random_uuid(),'productId',pid,'quantity',9,'note','Consumo de salida');
 perform boat_control.operations('inventory-fixture-key','stock_consume',req);
 perform boat_control.operations('inventory-fixture-key','stock_consume',req);
 assert (select (p->>'current')::numeric from boat_control.boats bb cross join lateral jsonb_array_elements(bb.state->'products') p where bb.id=b and p->>'id'=pid)=15,'consume once on retry';
 failed=false;begin perform boat_control.operations('inventory-fixture-key','stock_consume',req||jsonb_build_object('key',gen_random_uuid(),'quantity',16));exception when others then failed=true;end;assert failed,'cannot consume more than available';
 fleet=public.boat_inventory_rpc('inventory-fixture-key','fleet_stock',base||'{"session":"inventory-captain-session"}');
 select p into item from jsonb_array_elements(fleet) f cross join lateral jsonb_array_elements(f->'products') p where f->>'id'=other;
 assert item->>'name'='Filtro aceite' and (item->>'current')::integer=3,'captain sees other boat materials';
 assert not (item ?| array['cost','supplier','photo']) and fleet::text not like '%PRIVATE%','shared inventory allowlist';
 foreach crew in array array['chef','reader','sailor','manager'] loop
  failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','fleet_stock',base||jsonb_build_object('session','inventory-'||crew||'-session'));exception when insufficient_privilege then failed=true;end;assert failed,'fleet denied to '||crew;
 end loop;
 foreach crew in array array['chef','reader','sailor','manager','captain'] loop
  failed=false;begin perform public.boat_intake_rpc('inventory-fixture-key','scan_access',base||jsonb_build_object('session','inventory-'||crew||'-session'));exception when insufficient_privilege then failed=true;end;assert failed,'ticket scan denied to '||crew;
  failed=false;begin perform public.boat_intake_rpc('inventory-fixture-key','submit',base||jsonb_build_object('session','inventory-'||crew||'-session'));exception when insufficient_privilege then failed=true;end;assert failed,'legacy intake upload denied to '||crew;
  failed=false;begin perform public.boat_operations_rpc('inventory-fixture-key','stock_add',base||jsonb_build_object('session','inventory-'||crew||'-session'));exception when insufficient_privilege then failed=true;end;assert failed,'initial stock denied to '||crew;
  failed=false;begin perform public.boat_operations_rpc('inventory-fixture-key','request_receive',base||jsonb_build_object('session','inventory-'||crew||'-session'));exception when insufficient_privilege then failed=true;end;assert failed,'purchase receipt denied to '||crew;
 end loop;
 result=public.boat_operations_rpc('inventory-fixture-key','overview',base||'{"session":"inventory-captain-session"}');
 select x into item from jsonb_array_elements(result->'fleet') x where x->>'id'=other;
 assert item is not null and item->'products'->0->>'code'='F-123','captain sees other assigned boat stock';
 assert item::text not like '%PRIVATE%' and not ((item->'products'->0) ? 'cost'),'captain legacy overview hides private fields';
 result=public.boat_operations_rpc('inventory-fixture-key','overview',base||'{"session":"inventory-reader-session"}');
 assert jsonb_array_length(result->'fleet')=1 and result->'fleet'->0->>'id'=b,'legacy overview does not leak other assigned boats';
 assert not has_function_privilege('anon','boat_control.intake_before_inventory_roles(text,text,jsonb)','execute'),'no bypass through old intake';
 assert not has_function_privilege('anon','boat_control.operations_before_inventory_roles(text,text,jsonb)','execute'),'no bypass through old operations';
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','fleet_stock',base||'{"session":"missing"}');exception when invalid_authorization_specification then failed=true;end;assert failed,'anonymous denied';
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','fleet_stock',base||jsonb_build_object('session','inventory-chef-session','boat',other));exception when insufficient_privilege then failed=true;end;assert failed,'home boat membership required';
 failed=false;begin perform boat_control.operations('inventory-fixture-key','stock_consume',req||jsonb_build_object('boat',other,'productId','filter-fixture','quantity',1,'key',gen_random_uuid()));exception when insufficient_privilege then failed=true;end;assert failed,'shared visibility does not allow edits';
 select revision into rev from boat_control.boats where id=b;
 req=base||jsonb_build_object('key',gen_random_uuid(),'kind','purchase','confirmed',true,'revision',rev,
 'source',jsonb_build_object('text','QA ticket 002 invalid','photos','[]'::jsonb),
 'data',jsonb_build_object('date',(now() at time zone 'America/Buenos_Aires')::date,'supplier','QA','reference','QA-002','currency','USD','total',8,'notes','',
 'items',jsonb_build_array(jsonb_build_object('name','Nuevo','quantity',2,'unit','un','area','tecnica','location','Pañol'),jsonb_build_object('name','Inválido','quantity',-1,'unit','kg','area','gastronomia','location','Despensa'))));
 select count(*) into before_count from boat_control.stock_intakes where boat_id=b;
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req);exception when others then failed=true;end;assert failed,'invalid line rejected';
 assert (select count(*) from boat_control.stock_intakes where boat_id=b)=before_count,'failed ticket submission rolled back';
 assert (select revision from boat_control.boats where id=b)=rev,'no partial stock mutation';
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req||'{"session":"inventory-chef-session"}');exception when insufficient_privilege then failed=true;end;assert failed,'chef cannot approve expense';
 -- Valid data with a stale revision must also roll back the new ticket.
 req=jsonb_set(req,'{data,items,1,quantity}','1')||jsonb_build_object('revision',rev-1);
 failed=false;begin perform public.boat_inventory_rpc('inventory-fixture-key','ticket_confirm',req);exception when sqlstate 'PT409' then failed=true;end;assert failed,'stale revision rejected';
 assert (select count(*) from boat_control.stock_intakes where boat_id=b)=before_count,'conflict rolls back submission';
end $$;
select 'PASS: ticket atomicity, duplicates, consume, fleet visibility, privacy and permissions' as result;
