-- Forge AI Command Center, stage 5: rollout gate.
-- Additive only. The risk indicator and recommendation permissions move under the
-- forge_ai_command_center feature added in stage 1. Effective access already resolves a
-- permission's feature (platform state, then the tenant override, then the plan entitlement), so
-- a tenant without the Command Center loses these pages, tools and actions, and the
-- monitoring cycle skips risk scoring and recommendations for it. Everything else in Forge AI,
-- including AI Watch, is unchanged.

update public.forge_permission_registry
set feature_key = 'forge_ai_command_center', updated_at = now()
where permission_key in ('forge_ai.view_risk', 'forge_ai.view_recommendations', 'forge_ai.review_recommendations')
  and feature_key is distinct from 'forge_ai_command_center';
