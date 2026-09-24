import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'
import { runForgeAiWatch } from '@/lib/forgeAiWatch'

export const dynamic = 'force-dynamic'

const authorized = (request: Request) => {
  const secret = process.env.FORGE_AI_CRON_SECRET
  if (!secret) return false

  const auth = request.headers.get('authorization')
  return auth === 'Bearer ' + secret
}

const tenantHasForgeAi = async (
  supabase: any,
  organizationId: string,
  feature: any
) => {
  if (!feature || ['disabled','maintenance','deprecated'].includes(feature.platform_state)) {
    return false
  }

  if (!feature.requires_entitlement) return true

  const [{ data: override }, { data: subscriptionRows }] = await Promise.all([
    supabase
      .from('forge_tenant_entitlement_overrides')
      .select('enabled')
      .eq('organization_id', organizationId)
      .eq('feature_id', feature.id)
      .maybeSingle(),
    supabase
      .from('forge_subscriptions')
      .select('plan_id, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
  ])

  if (override) return Boolean(override.enabled)

  const subscription = subscriptionRows?.[0]
  if (!subscription?.plan_id) return false
  if (['canceled','archived'].includes(String(subscription.status))) return false

  const { data: planEntitlement } = await supabase
    .from('forge_plan_entitlements')
    .select('enabled')
    .eq('plan_id', subscription.plan_id)
    .eq('feature_id', feature.id)
    .maybeSingle()

  return Boolean(planEntitlement?.enabled)
}

const runScheduledWatch = async (request: Request) => {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const supabase = createServiceRoleClient() as any

  const [{ data: feature }, { data: settingsRows }] = await Promise.all([
    supabase
      .from('forge_feature_registry')
      .select('id, feature_key, platform_state, requires_entitlement')
      .eq('feature_key', 'forge_ai')
      .maybeSingle(),
    supabase
      .from('forge_ai_tenant_settings')
      .select('organization_id')
      .eq('enabled', true)
  ])

  if (!feature) {
    return NextResponse.json({ error: 'Forge AI feature is not configured.' }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []

  for (const row of settingsRows || []) {
    const organizationId = row.organization_id

    try {
      const available = await tenantHasForgeAi(supabase, organizationId, feature)

      if (!available) {
        results.push({
          organizationId,
          skipped: true,
          reason: 'Forge AI entitlement unavailable'
        })
        continue
      }

      const result = await runForgeAiWatch({
        organizationId,
        triggerType: 'scheduled'
      })

      results.push({
        organizationId,
        success: true,
        ...result
      })
    } catch (error) {
      results.push({
        organizationId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown scheduled Watch error'
      })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results
  })
}

export async function POST(request: Request) {
  return runScheduledWatch(request)
}

export async function GET(request: Request) {
  return runScheduledWatch(request)
}
