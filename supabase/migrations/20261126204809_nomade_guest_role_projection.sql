-- Keep the approved operational fiche and financial instruction separate.
-- Delegate all existing reads/writes and their authorization unchanged.
create function boat_control.guest_plans_visible(server_key text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; viewer boat_control.accounts%rowtype; member_role text; b text:=payload->>'boat';
begin
 result:=boat_control.guest_plans_api(server_key,operation,payload);
 if operation not in ('agenda','reservations') or not coalesce(boat_control.is_nomade(b),false) then return result; end if;
 select a.* into viewer from boat_control.accounts a join boat_control.sessions s on s.user_id=a.id
 where s.token=payload->>'session' and s.expires>now();
 if viewer.id is null then raise exception 'Iniciá sesión.' using errcode='28000'; end if;
 if viewer.admin then return result; end if;
 select role into member_role from boat_control.members where boat_id=b and user_id=viewer.id;
 -- A collection instruction is disclosed only for the exact assigned captain
 -- and the official published version, no matter which page reads the fiche.
 return (
  select coalesce(jsonb_agg(
   case when coalesce(allowed.finance,false) then kept.operational
   else (kept.operational - array['collection','reports','captainBalance','captainPayment','toCollectUsd','paid','crmBalance','currency'])
      #- '{details,captainCollection}' #- '{brief,draft,captainCollection}' #- '{operationalPreview,details,captainCollection}' end
   order by row.n),'[]'::jsonb)
  from jsonb_array_elements(result) with ordinality row(item,n)
  left join boat_control.reservation_briefs f on f.reservation_id=(row.item->>'id')::uuid and f.boat_id=b
  left join boat_control.brief_versions v on v.reservation_id=f.reservation_id and v.version=f.published_version
  cross join lateral (select member_role='capitan' and f.published_version>0
    and (row.item->'cashAssigned') is distinct from 'false'::jsonb
    and (row.item->'cashLegacyReview') is distinct from 'true'::jsonb
    and (row.item#>'{brief,sourceChanged}') is distinct from 'true'::jsonb
    and v.snapshot#>>'{details,captainCollection}'='collect'
    and case when f.reservation_id is not null then boat_control.captain_assigned(b,f.reservation_id,viewer.id) else false end as finance) allowed
  cross join lateral (select case
    when member_role='capitan' and f.reservation_id is not null and boat_control.captain_assigned(b,f.reservation_id,viewer.id)
    then row.item else row.item #- '{onboardPlan,fields,onboardNotes}' #- '{details,onboardNotes}' end as operational) kept
 );
end $$;
revoke all on function boat_control.guest_plans_visible(text,text,jsonb) from public,anon,authenticated;
create or replace function public.boat_guest_plan_rpc(server_key text, operation text, payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$select boat_control.guest_plans_visible(server_key,operation,payload)$$;
revoke all on function public.boat_guest_plan_rpc(text,text,jsonb) from public,anon,authenticated;
grant execute on function boat_control.guest_plans_visible(text,text,jsonb),public.boat_guest_plan_rpc(text,text,jsonb) to anon;
