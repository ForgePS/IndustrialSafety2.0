-- Enterprise is the everything-included plan: entitle every feature in the registry.
-- (Without rows here Creator showed every Enterprise feature as "Not included".)
insert into public.forge_plan_entitlements (plan_id, feature_id, enabled, config)
select p.id, f.id, true, '{}'::jsonb
from public.forge_plans p
cross join public.forge_feature_registry f
where p.plan_key = 'enterprise'
on conflict (plan_id, feature_id) do update set enabled = true;
