import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Resolve the project's existing test package via Node's CommonJS lookup.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const canRun=(()=>{try{return !!require.resolve('@electric-sql/pglite')}catch{return false}})();
const file=readFileSync(new URL('../supabase/migrations/20261127174515_boat_captain_personal_cash.sql',import.meta.url),'utf8');
const base=`
create role anon; create role authenticated;
create schema boat_control;create schema extensions;
grant usage on schema boat_control to anon,authenticated;
create function extensions.digest(key text,scheme text) returns bytea language sql immutable as $$select convert_to(key,'UTF8')$$;
create table boat_control.config(secret_hash text);
insert into boat_control.config values ('66697874757265');
create table boat_control.accounts(id text primary key,admin boolean not null default false);
create table boat_control.sessions(user_id text,token text,expires timestamptz);
create table boat_control.members(boat_id text,user_id text,role text);
create table boat_control.operation_receipts(user_id text,key uuid,request jsonb,result jsonb, primary key(user_id,key));
create table boat_control.captain_cash_entries(
 id bigint generated always as identity primary key, boat_id text,captain_id text,kind text,currency text,amount numeric,
 concept text,recorded_by text,prior_receipts uuid[],recorded_at timestamptz default now(),
 constraint captain_cash_entries_kind_check check (kind in ('opening','expense','handover')));
create function boat_control.captain_receipts(b text,a text) returns table(reservation_id uuid,amount numeric,reviewing boolean) language sql as $$
 select '484c2330-04ed-44bd-afbe-756204af69c5'::uuid,1500::numeric,false where b='nomad' and a='cap'
$$;
create function boat_control.captain_balances(b text,captain text)
 returns table(currency text,opening numeric,incoming numeric,spent numeric,balance numeric,handed_over numeric) language sql as $$select null::text,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric where false$$;
create function boat_control.captain_agenda_preview(s text,p jsonb) returns jsonb language sql as $$select '[]'::jsonb$$;
grant execute on function boat_control.captain_agenda_preview(text,jsonb) to anon,authenticated;
create function boat_control.captain_cash(s text,op text,p jsonb) returns jsonb language plpgsql security definer
 set search_path to '' as $fn$
 declare act text; adm boolean; b text:=p->>'boat';
 begin
  if s<>'fixture' then raise exception 'forbidden' using errcode='42501'; end if;
  select a.id,a.admin into act,adm from boat_control.accounts a join boat_control.sessions ss on ss.user_id=a.id where ss.token=p->>'session' and ss.expires>now();
  if act is null then raise exception 'invalid' using errcode='28000'; end if;
  if not adm and not exists(select 1 from boat_control.members where boat_id=b and user_id=act and role='capitan') then raise exception 'forbidden' using errcode='42501'; end if;
  if op<>'captain_wallet' then return jsonb_build_object('legacy',op); end if;
  return jsonb_build_object('wallets',coalesce((select jsonb_agg(jsonb_build_object('captainId',m.user_id,
  'balances',(select jsonb_agg(to_jsonb(t)) from boat_control.captain_balances(b,m.user_id) t)))
  from boat_control.members m where m.boat_id=b and m.role='capitan' and (adm or m.user_id=act)),'[]'));
 end $fn$;
create function public.boat_captain_cash_rpc(server_key text,operation text,payload jsonb) returns jsonb language sql as $$
 select boat_control.captain_cash(server_key,operation,payload)
$$;
revoke all on function public.boat_captain_cash_rpc(text,text,jsonb) from public;
grant execute on function public.boat_captain_cash_rpc(text,text,jsonb) to anon,authenticated;
insert into boat_control.accounts values ('cap',false),('chef',false),('admin',true),('other-cap',false);
insert into boat_control.sessions select id,id||'-session',now()+interval '1 hour' from boat_control.accounts;
insert into boat_control.members values ('nomad','cap','capitan'),('pink','other-cap','capitan'),('nomad','chef','chef');
insert into boat_control.captain_cash_entries(boat_id,captain_id,kind,currency,amount,concept,recorded_by) values
 ('nomad','cap','opening','USD',50,'Inicio','admin'),('nomad','cap','expense','USD',10,'Pescado','cap'),
 ('nomad','cap','handover','USD',20,'Entrega','admin');
`;
test('wallet separates physical, company, and out-of-pocket cash and prevents overdraw/idempotency/scope errors',{skip:!canRun&&'Install @electric-sql/pglite for isolated SQL QA'},async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 try {
 await db.exec(base);await db.exec(file);await db.exec('set role anon;');
 const call=async(op,body={},secret='fixture')=>(await db.query('select public.boat_captain_cash_rpc($1,$2,$3::jsonb) result',[secret,op,JSON.stringify({boat:'nomad',session:'cap-session',...body})])).rows[0].result;
 const wallet=async(session='cap-session')=>(await call('captain_wallet',{session})).wallets[0];
 const command=(kind,amount,n,body={})=>call('captain_personal_movement',{kind,amount,currency:'USD',concept:'Fixture test',key:'f2a32278-0cbd-4079-ba3f-'+String(n).padStart(12,'0'),...body});
 const check=async(amount,personal)=>{const w=await wallet();assert.equal(w.balances[0].balance,amount);assert.deepEqual(w.personal[0],{currency:'USD',...personal});};
 await check(1520,{contributed:0,withdrawn:0,spent:0,reimbursed:0});
 const first=await command('personal_contribution',55,1);
 assert.equal(first.ok,true);
 assert.deepEqual(await command('personal_contribution',55,1),first);
 await assert.rejects(command('personal_contribution',56,1),{code:'PT409'});
 await command('personal_spend',25,2);
 await check(1520,{contributed:55,withdrawn:0,spent:25,reimbursed:0});
 await assert.rejects(command('personal_withdrawal',56,3),{code:'PT409'});
 await command('personal_withdrawal',55,4);
 await assert.rejects(command('personal_reimburse',26,5),{code:'PT409'});
 await command('personal_reimburse',20,6);
 await check(1500,{contributed:55,withdrawn:55,spent:25,reimbursed:20});
 await assert.rejects(command('personal_reimburse',6,7),{code:'PT409'});
 await assert.rejects(command('personal_spend',1,8,{session:'chef-session'}),{code:'42501'});
 await assert.rejects(command('personal_spend',1,9,{session:'other-cap-session'}),{code:'42501'});
 await assert.rejects(command('personal_spend',1,10,{boat:'pink'}),{code:'42501'});
 await assert.rejects(command('personal_contribution',1,11,{currency:'EUR'}),{code:'PT409'});
 await assert.rejects(call('captain_wallet',{},'wrong'),{code:'42501'});
 const admin=await wallet('admin-session');assert.equal(admin.personalEntries.length,4);assert.equal(admin.balances[0].incoming,1500);assert.equal(admin.balances[0].handed_over,20);
 assert.deepEqual(await call('captain_handover'),{legacy:'captain_handover'});
 assert.deepEqual(await call('agenda'),[]);
 } finally {await db.close();}
});
