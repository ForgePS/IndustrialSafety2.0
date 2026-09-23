'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Switch } from '@repo/ui/components/ui/switch'
import { toast } from '@repo/ui/utils/toast'
import { savePlanEntitlement, savePlatformFeature } from './actions'

type Feature = {
  id: string
  feature_key: string
  name: string
  description: string | null
  category: string
  feature_type: string
  platform_state: 'enabled' | 'disabled' | 'beta' | 'maintenance' | 'deprecated'
  tenant_configurable: boolean
  location_configurable: boolean
  user_configurable: boolean
  requires_entitlement: boolean
  sort_order: number
}

type Plan = {
  id: string
  name: string
  plan_key: string
  status: string
}

type Entitlement = {
  plan_id: string
  feature_id: string
  enabled: boolean
}

const stateLabel = (state: string) =>
  state.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const FeatureManager = ({
  features,
  plans,
  entitlements
}: {
  features: Feature[]
  plans: Plan[]
  entitlements: Entitlement[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [featureState, setFeatureState] = useState<Record<string, Feature>>(
    Object.fromEntries(features.map(feature => [feature.id, feature]))
  )
  const [planState, setPlanState] = useState<Record<string, boolean>>(
    Object.fromEntries(entitlements.map(item => [`${item.plan_id}:${item.feature_id}`, item.enabled]))
  )

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(features.map(feature => feature.category))).sort()],
    [features]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return features.filter(feature => {
      const matchesSearch =
        !q ||
        feature.name.toLowerCase().includes(q) ||
        feature.feature_key.toLowerCase().includes(q) ||
        feature.category.toLowerCase().includes(q) ||
        feature.description?.toLowerCase().includes(q)

      return matchesSearch && (category === 'all' || feature.category === category)
    })
  }, [category, features, search])

  const saveFeature = (featureId: string) => {
    const feature = featureState[featureId]
    if (!feature) return

    startTransition(async () => {
      const result = await savePlatformFeature({
        featureId,
        platformState: feature.platform_state,
        tenantConfigurable: feature.tenant_configurable,
        locationConfigurable: feature.location_configurable,
        userConfigurable: feature.user_configurable
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to update feature.')
        return
      }

      toast('success', result.message)
    })
  }

  const togglePlan = (planId: string, featureId: string, enabled: boolean) => {
    const key = `${planId}:${featureId}`
    setPlanState(current => ({ ...current, [key]: enabled }))

    startTransition(async () => {
      const result = await savePlanEntitlement({ planId, featureId, enabled })

      if ('error' in result) {
        setPlanState(current => ({ ...current, [key]: !enabled }))
        toast('error', result.error || 'Unable to update plan entitlement.')
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
              placeholder='Search features, modules or keys...'
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

      <Card>
        <CardHeader>
          <CardTitle>Plan Entitlement Matrix</CardTitle>
          <CardDescription>
            Plan defaults determine what a tenant receives before any tenant-specific override is applied.
          </CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full min-w-[760px] text-sm'>
            <thead>
              <tr className='border-b'>
                <th className='p-3 text-left'>Feature</th>
                {plans.map(plan => <th key={plan.id} className='p-3 text-center'>{plan.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.filter(feature => feature.requires_entitlement).map(feature => (
                <tr key={feature.id} className='border-b last:border-0'>
                  <td className='p-3'>
                    <div className='text-textPrimary font-medium'>{feature.name}</div>
                    <div className='text-textSecondary text-xs'>{feature.feature_key}</div>
                  </td>
                  {plans.map(plan => {
                    const key = `${plan.id}:${feature.id}`
                    const checked = Boolean(planState[key])

                    return (
                      <td key={plan.id} className='p-3 text-center'>
                        <div className='inline-flex items-center gap-2'>
                          <Switch
                            checked={checked}
                            disabled={pending}
                            onCheckedChange={value => togglePlan(plan.id, feature.id, value)}
                          />
                          <span className='text-textSecondary text-xs'>{checked ? 'Included' : 'Not Included'}</span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {filtered.map(feature => {
        const draft = featureState[feature.id]

        return (
          <Card key={feature.id}>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CardTitle>{feature.name}</CardTitle>
                    <Badge size='sm' variant={draft.platform_state === 'enabled' ? 'tonalSuccess' : 'secondary'}>
                      {stateLabel(draft.platform_state)}
                    </Badge>
                    <Badge size='sm' variant='outline'>{feature.feature_type}</Badge>
                  </div>
                  <CardDescription className='mt-2'>{feature.description || feature.feature_key}</CardDescription>
                  <div className='text-textSecondary mt-1 text-xs'>{feature.feature_key} · {feature.category}</div>
                </div>
                <Button onClick={() => saveFeature(feature.id)} disabled={pending}>Save Feature</Button>
              </div>
            </CardHeader>
            <CardContent className='grid gap-5 lg:grid-cols-4'>
              <div>
                <div className='text-textPrimary mb-2 text-sm font-medium'>Platform State</div>
                <select
                  value={draft.platform_state}
                  onChange={event =>
                    setFeatureState(current => ({
                      ...current,
                      [feature.id]: {
                        ...current[feature.id],
                        platform_state: event.target.value as Feature['platform_state']
                      }
                    }))
                  }
                  className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
                >
                  <option value='enabled'>Enabled</option>
                  <option value='beta'>Beta</option>
                  <option value='maintenance'>Maintenance</option>
                  <option value='disabled'>Disabled</option>
                  <option value='deprecated'>Deprecated</option>
                </select>
              </div>

              {[
                ['tenant_configurable', 'Tenant Configurable', 'Company admins may configure this capability.'],
                ['location_configurable', 'Location Configurable', 'Overrides may exist at the Location level.'],
                ['user_configurable', 'User Configurable', 'User-level preferences or controls may be exposed.']
              ].map(([key, label, description]) => (
                <label key={key} className='flex items-start gap-3 rounded-lg border p-4'>
                  <Switch
                    checked={Boolean(draft[key as keyof Feature])}
                    onCheckedChange={value =>
                      setFeatureState(current => ({
                        ...current,
                        [feature.id]: { ...current[feature.id], [key]: value }
                      }))
                    }
                  />
                  <span>
                    <span className='text-textPrimary block text-sm font-medium'>{label}</span>
                    <span className='text-textSecondary mt-1 block text-xs'>{description}</span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default FeatureManager
