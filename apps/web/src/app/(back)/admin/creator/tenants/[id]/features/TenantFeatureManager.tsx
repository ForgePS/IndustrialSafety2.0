'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { toast } from '@repo/ui/utils/toast'
import { saveTenantEntitlementOverride } from '../../../features/actions'

type Feature = {
  id: string
  feature_key: string
  name: string
  description: string | null
  category: string
  platform_state: string
  tenant_configurable: boolean
  location_configurable: boolean
  user_configurable: boolean
  requires_entitlement: boolean
  sort_order: number
}

type TenantFeature = Feature & {
  planEnabled: boolean | null
  overrideEnabled: boolean | null
  tenantCanConfigureOverride: boolean | null
}

type Draft = {
  mode: 'inherit' | 'on' | 'off'
  tenantCanConfigure: boolean | null
}

const TenantFeatureManager = ({
  organizationId,
  features
}: {
  organizationId: string
  features: TenantFeature[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    Object.fromEntries(
      features.map(feature => [
        feature.id,
        {
          mode: feature.overrideEnabled === null ? 'inherit' : feature.overrideEnabled ? 'on' : 'off',
          tenantCanConfigure: feature.tenantCanConfigureOverride
        }
      ])
    )
  )

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(features.map(feature => feature.category))).sort()],
    [features]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return features.filter(feature => {
      const matches =
        !q ||
        feature.name.toLowerCase().includes(q) ||
        feature.feature_key.toLowerCase().includes(q) ||
        feature.category.toLowerCase().includes(q) ||
        feature.description?.toLowerCase().includes(q)

      return matches && (category === 'all' || feature.category === category)
    })
  }, [category, features, search])

  const effectiveEnabled = (feature: TenantFeature, draft: Draft) => {
    if (['disabled', 'maintenance', 'deprecated'].includes(feature.platform_state)) return false
    if (draft.mode === 'on') return true
    if (draft.mode === 'off') return false
    if (!feature.requires_entitlement) return true
    return Boolean(feature.planEnabled)
  }

  const save = (feature: TenantFeature) => {
    const draft = drafts[feature.id]

    startTransition(async () => {
      const result = await saveTenantEntitlementOverride({
        organizationId,
        featureId: feature.id,
        mode: draft.mode,
        tenantCanConfigure: draft.tenantCanConfigure
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to update tenant entitlement.')
        return
      }

      toast('success', result.message)
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_240px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search tenant features...'
              className='pl-10'
            />
          </div>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            {categories.map(item => <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>)}
          </select>
        </CardContent>
      </Card>

      {filtered.map(feature => {
        const draft = drafts[feature.id]
        const enabled = effectiveEnabled(feature, draft)
        const platformBlocked = ['disabled', 'maintenance', 'deprecated'].includes(feature.platform_state)

        return (
          <Card key={feature.id}>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CardTitle>{feature.name}</CardTitle>
                    <Badge size='sm' variant={enabled ? 'tonalSuccess' : 'secondary'}>
                      {enabled ? 'Effective On' : 'Effective Off'}
                    </Badge>
                    {platformBlocked ? <Badge size='sm' variant='destructive'>Platform {feature.platform_state}</Badge> : null}
                  </div>
                  <CardDescription className='mt-2'>{feature.description || feature.feature_key}</CardDescription>
                  <div className='text-textSecondary mt-1 text-xs'>{feature.feature_key} · {feature.category}</div>
                </div>
                <Button onClick={() => save(feature)} disabled={pending}>Save</Button>
              </div>
            </CardHeader>
            <CardContent className='grid gap-5 lg:grid-cols-[240px_1fr_1fr]'>
              <div>
                <div className='text-textPrimary mb-2 text-sm font-medium'>Tenant Entitlement</div>
                <select
                  value={draft.mode}
                  disabled={platformBlocked}
                  onChange={event =>
                    setDrafts(current => ({
                      ...current,
                      [feature.id]: {
                        ...current[feature.id],
                        mode: event.target.value as Draft['mode']
                      }
                    }))
                  }
                  className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
                >
                  <option value='inherit'>Inherit Plan</option>
                  <option value='on'>Force On</option>
                  <option value='off'>Force Off</option>
                </select>
                <div className='text-textSecondary mt-2 text-xs'>
                  Plan default: {feature.requires_entitlement ? (feature.planEnabled ? 'Included' : 'Not included') : 'Not entitlement-controlled'}
                </div>
              </div>

              <label className='flex items-start gap-3 rounded-lg border p-4'>
                <Switch
                  checked={draft.tenantCanConfigure ?? feature.tenant_configurable}
                  disabled={!feature.tenant_configurable || platformBlocked}
                  onCheckedChange={value =>
                    setDrafts(current => ({
                      ...current,
                      [feature.id]: {
                        ...current[feature.id],
                        tenantCanConfigure: value
                      }
                    }))
                  }
                />
                <span>
                  <span className='text-textPrimary block text-sm font-medium'>Tenant Admin Can Configure</span>
                  <span className='text-textSecondary mt-1 block text-xs'>
                    Company admins may change tenant-level settings for this feature when Forge exposes them.
                  </span>
                </span>
              </label>

              <div className='rounded-lg border p-4'>
                <div className='text-textPrimary text-sm font-medium'>Allowed Override Layers</div>
                <div className='mt-3 flex flex-wrap gap-2'>
                  <Badge size='sm' variant={feature.tenant_configurable ? 'tonalSuccess' : 'secondary'}>Tenant</Badge>
                  <Badge size='sm' variant={feature.location_configurable ? 'tonalSuccess' : 'secondary'}>Location</Badge>
                  <Badge size='sm' variant={feature.user_configurable ? 'tonalSuccess' : 'secondary'}>User</Badge>
                </div>
                <div className='text-textSecondary mt-3 text-xs'>
                  These layers are controlled by Forge Creator and cannot be expanded by the tenant.
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default TenantFeatureManager
