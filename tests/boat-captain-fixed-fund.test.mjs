import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const available=(()=>{try{return !!require.resolve('@electric-sql/pglite')}catch{return false}})();
const source=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Caja: sin monto por defecto y edición administrativa por capitán',()=>{
  const esc=v=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const ctx=vm.createContext({session:{admin:true},document:{addEventListener(){}},esc,empty:s=>s,briefTime:s=>s,
    opsForm:(op,body,id)=>'<form data-operation="'+op+'" data-id="'+esc(id)+'">'+body+'</form>',
    opsField:(label,name,type,value,attrs)=>'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'>'});
  vm.runInContext(source('public/a-bordo/captain-cash.js'),ctx);
  const wallet={captainId:'captain-a',name:'Capitán',balances:[{currency:'USD',opening:90,balance:100,incoming:10,spent:0}],expenses:[],receipts:[]};
  assert.match(ctx.captainWallet(wallet),/Sin definir[\s\S]*Definir monto fijo/);
  assert.match(ctx.captainWallet(wallet),/data-id="captain-a"/);
  const assigned={...wallet,fixedFund:{currency:'EUR',amount:50,revision:2,updatedAt:'2026-11-28'}};
  const configured=ctx.captainWallet(assigned);
  assert.match(configured,/EUR 50,00/);
  assert.match(configured,/name="revision" value="2"/);
  assert.match(configured,/<option selected>EUR<\/option>/);
  assert.match(configured,/USD 100,00/);
  ctx.session={admin:false};
  assert.match(ctx.captainWallet(assigned),/EUR 50,00/);
  assert.doesNotMatch(ctx.captainWallet(assigned),/captain_fixed_fund_set/);
  assert.match(ctx.captainWallet({...wallet,fixedFund:{...assigned.fixedFund,amount:0}}),/EUR 0,00/);
});

test('SQL: versiones, edición protegida e independencia del efectivo', {skip:!available},async()=>{
  const {PGlite}=require('@electric-sql/pglite');
  const db=await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema boat_control; create schema extensions;
      create function extensions.digest(text,text) returns bytea language sql immutable as 'select pg_catalog.sha256(pg_catalog.convert_to($1,''UTF8''))';
      create table boat_control.boats(id text primary key);
      create table boat_control.accounts(id text primary key,admin boolean not null);
      create table boat_control.config(secret_hash text);
      create table boat_control.sessions(token text primary key,user_id text,expires timestamptz);
      create table boat_control.members(boat_id text,user_id text,role text);
      create table boat_control.operation_receipts(user_id text,key uuid, request jsonb,result jsonb,primary key(user_id,key));
      create table boat_control.cash_ledger(amount numeric);
      insert into boat_control.cash_ledger values(100);
      insert into boat_control.config values(encode(extensions.digest('fixture','sha256'),'hex'));
      insert into boat_control.boats values('boat-a'),('boat-b');
      insert into boat_control.accounts values('admin',true),('captain-a',false),('captain-b',false),('chef',false);
      insert into boat_control.sessions select id,id,now()+interval '1 hour' from boat_control.accounts;
      insert into boat_control.members values('boat-a','captain-a','capitan'),('boat-a','captain-b','capitan'),('boat-a','chef','chef'),('boat-b','captain-a','capitan');
      create function public.boat_captain_cash_rpc(server_key text,operation text,payload jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $f$
      declare actor text:=payload->>'session'; is_admin boolean; b text:=payload->>'boat';
      begin
        if server_key is distinct from 'fixture' then raise exception 'denied' using errcode='42501'; end if;
        select admin into is_admin from boat_control.accounts where id=actor;
        if is_admin is null then raise exception 'session' using errcode='28000'; end if;
        if not is_admin and not exists(select 1 from boat_control.members where boat_id=b and user_id=actor and role='capitan') then
          raise exception 'denied' using errcode='42501';
        end if;
        return jsonb_build_object('personalCashVersion',1,'wallets',coalesce((
          select jsonb_agg(jsonb_build_object('captainId',user_id,'balances',jsonb_build_array(jsonb_build_object('balance',100))) order by user_id)
           from boat_control.members where boat_id=b and role='capitan' and (is_admin or user_id=actor)),'[]'::jsonb));
      end $f$;
      grant usage on schema boat_control to anon,authenticated;
    `);
    await db.exec(source('supabase/migrations/20261128002926_boat_captain_fixed_fund.sql'));
    const call=async(op,payload,secret='fixture')=>(await db.query('select public.boat_captain_fixed_fund_rpc($1,$2,$3::jsonb) as value',[secret,op,payload])).rows[0].value;
    const read=(session,boat='boat-a')=>call('captain_wallet',{session,boat});
    const save=(fields={},secret='fixture')=>call('captain_fixed_fund_set',{session:'admin',boat:'boat-a',id:'captain-a',amount:40.5,currency:'USD',revision:0,key:randomUUID(),...fields},secret);
    assert.equal((await read('admin')).wallets[0].fixedFund,null);
    const key=randomUUID();
    const saved=await save({key});
    assert.deepEqual(saved,{ok:true,revision:1,amount:40.5,currency:'USD',captainId:'captain-a'});
    assert.deepEqual(await save({key}),saved);
    await assert.rejects(save({key,amount:41}),{code:'PT409'});
    await assert.rejects(save({revision:0}),{code:'PT409'});
    await assert.rejects(save({session:'captain-a',revision:1}),{code:'42501'});
    await assert.rejects(save({session:'chef',revision:1}),{code:'42501'});
    await assert.rejects(save({id:'chef'}),{code:'42501'});
    await assert.rejects(save({id:'captain-b',boat:'boat-b'}),{code:'42501'});
    await assert.rejects(save({session:'bad'}),{code:'28000'});
    await assert.rejects(save({},'bad'),{code:'42501'});
    await assert.rejects(save({revision:1,amount:1.111}),{code:'P0001'});
    await assert.rejects(save({revision:1,amount:-1}),{code:'P0001'});
    await assert.rejects(read('chef'),{code:'42501'});
    assert.equal((await read('captain-b')).wallets[0].fixedFund,null);
    assert.equal((await read('captain-a','boat-b')).wallets[0].fixedFund,null);
    assert.equal((await read('captain-a')).wallets[0].fixedFund.amount,40.5);
    assert.equal((await save({revision:1,amount:0,currency:'EUR'})).revision,2);
    const wallet=(await read('captain-a')).wallets[0];
    assert.equal(wallet.fixedFund.amount,0);
    assert.equal(wallet.fixedFund.currency,'EUR');
    assert.equal(wallet.balances[0].balance,100);
    assert.equal((await db.query('select count(*)::int as n from boat_control.captain_fixed_fund_revisions')).rows[0].n,2);
    assert.equal((await db.query('select amount from boat_control.cash_ledger')).rows[0].amount,'100');
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from boat_control.captain_fixed_fund_revisions'),{code:'42501'});
    assert.equal((await read('captain-a')).wallets[0].fixedFund.amount,0);
  } finally {await db.close();}
});
