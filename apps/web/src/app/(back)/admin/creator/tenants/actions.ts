'use server'

// Next Imports
import { revalidatePath } from 'next/cache'

// Third-party Imports
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

// Lib Imports
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const tenantSchema = z.object({
  name: z.string().trim().min(2, 'Company name is required.'),
  legalName: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  customerNumber: z.string().trim().optional(),
  primaryContactName: z.string().trim().optional(),
  primaryContactEmail: z.union([z.string().trim().email('Enter a valid primary contact email.'), z.literal('')]).optional(),
  billingContactEmail: z.union([z.string().trim().email('Enter a valid billing contact email.'), z.literal('')]).optional(),
  phone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  timezone: z.string().trim().min(1),
  locale: z.string().trim().min(1),
  internalNotes: z.string().trim().optional(),
  planId: z.string().uuid().optional().or(z.literal('')),
  subscriptionStatus: z.enum(['trial', 'onboarding', 'active', 'past_due', 'suspended', 'canceled', 'archived'])
})

export type TenantInput = z.infer<typeof tenantSchema>

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const emptyToNull = (value?: string) => {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

const writeAudit = async (supabase: any, actorUserId: string, organizationId: string, action: string, beforeValue?: unknown, afterValue?: unknown) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'organization',
    entity_id: organizationId,
    before_value: beforeValue ?? null,
    after_value: afterValue ?? null
  })
}

const provisionDefaultRoles = async (supabase: any, organizationId: string) => {
  const roles = [
    ['company-owner', 'Company Owner', 'Full tenant ownership and company administration.', 10],
    ['company-administrator', 'Company Administrator', 'Company-wide administration within Forge Creator policy.', 20],
    ['location-administrator', 'Location Administrator', 'Administration limited to assigned Locations.', 30],
    ['supervisor', 'Supervisor', 'Operational supervisor with assigned personnel scope.', 40],
    ['employee', 'Employee', 'Standard employee access.', 50],
    ['read-only', 'Read Only', 'Read-only access to explicitly permitted modules.', 60]
  ]

  const { data: createdRoles, error } = await supabase.from('forge_tenant_roles').insert(
    roles.map(([roleKey, name, description, sortOrder]) => ({
      organization_id: organizationId,
      role_key: roleKey,
      name,
      description,
      sort_order: sortOrder,
      is_system_role: true,
      is_active: true
    }))
  ).select('id, role_key')

  if (error) throw new Error(error.message)

  const templateMap: Record<string, string> = {
    'company-owner': 'company-admin',
    'company-administrator': 'company-admin',
    'location-administrator': 'supervisor',
    supervisor: 'supervisor',
    employee: 'standard-user',
    'read-only': 'read-only'
  }

  const { data: templates } = await supabase
    .from('forge_role_templates')
    .select('id, template_key, forge_role_template_permissions(permission_id, allowed, scope, constraints)')
    .in('template_key', Array.from(new Set(Object.values(templateMap))))

  const templateByKey = new Map((templates || []).map((template: any) => [template.template_key, template]))

  const grants = (createdRoles || []).flatMap((role: any) => {
    const template = templateByKey.get(templateMap[role.role_key])
    if (!template) return []

    return (template.forge_role_template_permissions || [])
      .filter((permission: any) => permission.allowed)
      .map((permission: any) => ({
        role_id: role.id,
        permission_id: permission.permission_id,
        allowed: true,
        scope: permission.scope || 'organization',
        constraints: permission.constraints || {}
      }))
  })

  if (grants.length) {
    const { error: grantError } = await supabase.from('forge_tenant_role_permissions').insert(grants)
    if (grantError) throw new Error(grantError.message)
  }
}

export const createTenant = async (input: TenantInput) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const parsed = tenantSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid tenant data.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any
  const slug = slugify(data.slug || data.name)

  if (!slug) return { error: 'A valid tenant slug is required.' }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .insert({
      name: data.name.trim(),
      legal_name: emptyToNull(data.legalName),
      slug,
      customer_number: emptyToNull(data.customerNumber),
      primary_contact_name: emptyToNull(data.primaryContactName),
      primary_contact_email: emptyToNull(data.primaryContactEmail),
      billing_contact_email: emptyToNull(data.billingContactEmail),
      phone: emptyToNull(data.phone),
      website: emptyToNull(data.website),
      timezone: data.timezone,
      locale: data.locale,
      internal_notes: emptyToNull(data.internalNotes),
      status: data.subscriptionStatus === 'suspended' ? 'suspended' : 'active',
      created_by: user.id
    })
    .select('*')
    .single()

  if (organizationError || !organization) return { error: organizationError?.message ?? 'Unable to create tenant.' }

  try {
    await provisionDefaultRoles(supabase, organization.id)

    if (data.planId) {
      const { error: subscriptionError } = await supabase.from('forge_subscriptions').insert({
        organization_id: organization.id,
        plan_id: data.planId,
        status: data.subscriptionStatus,
        starts_at: new Date().toISOString()
      })
      if (subscriptionError) throw new Error(subscriptionError.message)
    }

    await writeAudit(supabase, user.id, organization.id, 'tenant.created', null, organization)
  } catch (error) {
    await supabase.from('organizations').delete().eq('id', organization.id)
    return { error: error instanceof Error ? error.message : 'Tenant provisioning failed.' }
  }

  revalidatePath('/admin/creator/tenants')
  return { id: organization.id, message: 'Tenant created successfully.' }
}

export const updateTenant = async (organizationId: string, input: TenantInput) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const parsed = tenantSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid tenant data.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any
  const { data: beforeTenant, error: beforeError } = await supabase.from('organizations').select('*').eq('id', organizationId).single()

  if (beforeError || !beforeTenant) return { error: beforeError?.message ?? 'Tenant not found.' }

  const { data: updatedTenant, error: tenantError } = await supabase
    .from('organizations')
    .update({
      name: data.name.trim(),
      legal_name: emptyToNull(data.legalName),
      slug: slugify(data.slug || data.name),
      customer_number: emptyToNull(data.customerNumber),
      primary_contact_name: emptyToNull(data.primaryContactName),
      primary_contact_email: emptyToNull(data.primaryContactEmail),
      billing_contact_email: emptyToNull(data.billingContactEmail),
      phone: emptyToNull(data.phone),
      website: emptyToNull(data.website),
      timezone: data.timezone,
      locale: data.locale,
      internal_notes: emptyToNull(data.internalNotes),
      status: data.subscriptionStatus === 'suspended' ? 'suspended' : beforeTenant.status === 'archived' ? 'archived' : 'active',
      suspended_at: data.subscriptionStatus === 'suspended' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', organizationId)
    .select('*')
    .single()

  if (tenantError || !updatedTenant) return { error: tenantError?.message ?? 'Unable to update tenant.' }

  const { data: currentSubscription } = await supabase
    .from('forge_subscriptions')
    .select('id')
    .eq('organization_id', organizationId)
    .in('status', ['trial', 'onboarding', 'active', 'past_due', 'suspended'])
    .maybeSingle()

  if (currentSubscription?.id) {
    const { error } = await supabase.from('forge_subscriptions').update({
      plan_id: data.planId || null,
      status: data.subscriptionStatus,
      updated_at: new Date().toISOString()
    }).eq('id', currentSubscription.id)
    if (error) return { error: error.message }
  } else if (data.planId && !['canceled', 'archived'].includes(data.subscriptionStatus)) {
    const { error } = await supabase.from('forge_subscriptions').insert({
      organization_id: organizationId,
      plan_id: data.planId,
      status: data.subscriptionStatus,
      starts_at: new Date().toISOString()
    })
    if (error) return { error: error.message }
  }

  await writeAudit(supabase, user.id, organizationId, 'tenant.updated', beforeTenant, updatedTenant)
  revalidatePath('/admin/creator/tenants')
  revalidatePath(`/admin/creator/tenants/${organizationId}`)
  return { message: 'Tenant updated successfully.' }
}
