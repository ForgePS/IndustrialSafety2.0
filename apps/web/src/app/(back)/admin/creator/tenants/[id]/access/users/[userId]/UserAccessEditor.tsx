'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TbAlertTriangle, TbCheck, TbMinus, TbSearch, TbX } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'
import { saveIndividualTenantAccess, saveTenantUserScopeAssignments } from '../actions'

type Role = { id: string; name: string; description: string | null }
type Place = { id: string; name: string; code?: string | null }

type EffectivePermission = {
  permissionId: string
  permissionKey: string
  name: string
  group: string
  featureKey: string | null
  allowed: boolean
  scope: string | null
  source: 'role' | 'override_allow' | 'override_deny' | 'not_granted' | 'feature_unavailable'
  assignedRoles: string[]
  overrideState: 'inherit' | 'allow' | 'deny'
  featureAvailable: boolean
}

const scopeLabels: Record<string, string> = {
  own: 'Own Record',
  assigned: 'Assigned Personnel',
  location: 'Location',
  division: 'Division',
  organization: 'Entire Company'
}

const UserAccessEditor = ({
  organizationId,
  userId,
  roles,
  effective,
  assignedRoleIds,
  locations,
  divisions,
  selectedLocationIds,
  selectedDivisionIds
}: {
  organizationId: string
  userId: string
  roles: Role[]
  effective: EffectivePermission[]
  assignedRoleIds: string[]
  locations: Place[]
  divisions: Place[]
  selectedLocationIds: string[]
  selectedDivisionIds: string[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [roleIds, setRoleIds] = useState<string[]>(assignedRoleIds)
  const [search, setSearch] = useState('')
  const [locationIds, setLocationIds] = useState<string[]>(selectedLocationIds)
  const [divisionIds, setDivisionIds] = useState<string[]>(selectedDivisionIds)

  const [overrides, setOverrides] = useState<Record<string, { state: 'inherit' | 'allow' | 'deny'; scope: string | null }>>(
    Object.fromEntries(
      effective.map(permission => [
        permission.permissionId,
        {
          state: permission.overrideState,
          scope: permission.scope || 'organization'
        }
      ])
    )
  )

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    return effective
      .filter(permission =>
        !q ||
        permission.name.toLowerCase().includes(q) ||
        permission.group.toLowerCase().includes(q) ||
        permission.permissionKey.toLowerCase().includes(q)
      )
      .reduce<Record<string, EffectivePermission[]>>((acc, permission) => {
        acc[permission.group] ||= []
        acc[permission.group].push(permission)
        return acc
      }, {})
  }, [effective, search])

  const toggleRole = (roleId: string) => {
    setRoleIds(current => current.includes(roleId) ? current.filter(id => id !== roleId) : [...current, roleId])
  }

  const togglePlace = (id: string, current: string[], setter: (value: string[]) => void) => {
    setter(current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const saveAccess = () => {
    startTransition(async () => {
      const result = await saveIndividualTenantAccess({
        organizationId,
        userId,
        roleIds,
        overrides: effective.map(permission => ({
          permissionId: permission.permissionId,
          state: overrides[permission.permissionId]?.state || 'inherit',
          scope: overrides[permission.permissionId]?.scope || null
        }))
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save access.')
        return
      }

      const scopeResult = await saveTenantUserScopeAssignments({
        organizationId,
        userId,
        locationIds,
        divisionIds
      })

      if ('error' in scopeResult) {
        toast('error', scopeResult.error || 'Access saved, but scope assignments failed.')
        return
      }

      toast('success', 'Individual access saved.')
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-6 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Assigned Roles</CardTitle>
            <CardDescription>Role permissions are inherited unless an individual override changes them.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-2'>
            {roles.map(role => {
              const checked = roleIds.includes(role.id)
              return (
                <button
                  type='button'
                  key={role.id}
                  onClick={() => toggleRole(role.id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    checked ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'
                  }`}
                >
                  <div className='flex items-start gap-3'>
                    <div className={`mt-0.5 flex size-5 items-center justify-center rounded border ${
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                    }`}>
                      {checked ? <TbCheck /> : null}
                    </div>
                    <div>
                      <div className='text-textPrimary font-semibold'>{role.name}</div>
                      <div className='text-textSecondary mt-1 text-xs'>{role.description || 'No description'}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope Assignments</CardTitle>
            <CardDescription>
              Used when permissions are limited to specific Locations or Divisions.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-5 md:grid-cols-2'>
            <div>
              <div className='text-textPrimary mb-2 font-semibold'>Locations</div>
              <div className='flex flex-col gap-2'>
                {locations.length ? locations.map(location => (
                  <label key={location.id} className='flex cursor-pointer items-center gap-3 rounded-md border p-3'>
                    <input
                      type='checkbox'
                      checked={locationIds.includes(location.id)}
                      onChange={() => togglePlace(location.id, locationIds, setLocationIds)}
                    />
                    <span>{location.name}</span>
                  </label>
                )) : <span className='text-textSecondary text-sm'>No Locations configured.</span>}
              </div>
            </div>
            <div>
              <div className='text-textPrimary mb-2 font-semibold'>Divisions</div>
              <div className='flex flex-col gap-2'>
                {divisions.length ? divisions.map(division => (
                  <label key={division.id} className='flex cursor-pointer items-center gap-3 rounded-md border p-3'>
                    <input
                      type='checkbox'
                      checked={divisionIds.includes(division.id)}
                      onChange={() => togglePlace(division.id, divisionIds, setDivisionIds)}
                    />
                    <span>{division.name}</span>
                  </label>
                )) : <span className='text-textSecondary text-sm'>No Divisions configured.</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Individual Permission Overrides</CardTitle>
          <CardDescription>
            Use Role Default leaves the role result alone. Allow or Deny overrides the assigned roles for this person.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search permissions...'
              className='pl-10'
            />
          </div>
        </CardContent>
      </Card>

      {Object.entries(grouped).map(([group, permissions]) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{group}</CardTitle>
            <CardDescription>Fine-tune only the exceptions for this person.</CardDescription>
          </CardHeader>
          <CardContent className='divide-y'>
            {permissions.map(permission => {
              const current = overrides[permission.permissionId] || { state: 'inherit', scope: permission.scope || 'organization' }

              return (
                <div key={permission.permissionId} className='grid gap-4 py-4 xl:grid-cols-[minmax(0,1fr)_410px_200px] xl:items-center'>
                  <div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-textPrimary font-medium'>{permission.name}</span>
                      {!permission.featureAvailable ? <Badge size='sm' variant='secondary'>Feature unavailable</Badge> : null}
                      {permission.source === 'role' ? <Badge size='sm' variant='outline'>Inherited</Badge> : null}
                      {permission.source === 'override_allow' ? <Badge size='sm' variant='tonalSuccess'>Override Allow</Badge> : null}
                      {permission.source === 'override_deny' ? <Badge size='sm' variant='destructive'>Override Deny</Badge> : null}
                    </div>
                    <div className='text-textSecondary mt-1 text-sm'>
                      Current effective access: <strong>{permission.allowed ? 'Allowed' : 'Denied'}</strong>
                      {permission.scope ? ` · ${scopeLabels[permission.scope] || permission.scope}` : ''}
                    </div>
                    {permission.assignedRoles.length ? (
                      <div className='text-textSecondary mt-1 text-xs'>From: {permission.assignedRoles.join(', ')}</div>
                    ) : null}
                  </div>

                  <div className='grid grid-cols-3 gap-2'>
                    {([
                      ['inherit', 'Use Role Default', TbMinus],
                      ['allow', 'Allow', TbCheck],
                      ['deny', 'Deny', TbX]
                    ] as const).map(([state, label, Icon]) => (
                      <button
                        type='button'
                        key={state}
                        disabled={!permission.featureAvailable}
                        onClick={() =>
                          setOverrides(values => ({
                            ...values,
                            [permission.permissionId]: {
                              ...values[permission.permissionId],
                              state,
                              scope: values[permission.permissionId]?.scope || permission.scope || 'organization'
                            }
                          }))
                        }
                        className={`flex min-h-10 items-center justify-center gap-1 rounded-md border px-2 text-sm transition ${
                          current.state === state ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-neutral/5'
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <Icon />
                        {label}
                      </button>
                    ))}
                  </div>

                  <div>
                    {current.state === 'allow' && permission.featureAvailable ? (
                      <select
                        value={current.scope || 'organization'}
                        onChange={event =>
                          setOverrides(values => ({
                            ...values,
                            [permission.permissionId]: {
                              ...current,
                              scope: event.target.value
                            }
                          }))
                        }
                        className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
                      >
                        {['own', 'assigned', 'location', 'division', 'organization'].map(scope => (
                          <option key={scope} value={scope}>{scopeLabels[scope]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className='text-textSecondary text-sm'>
                        {current.state === 'inherit' ? 'Uses role scope' : 'No access'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <div className='sticky bottom-4 z-10 flex justify-end'>
        <div className='bg-card flex items-center gap-3 rounded-xl border p-3 shadow-lg'>
          <TbAlertTriangle className='text-warning' />
          <span className='text-textSecondary text-sm'>Individual overrides should be used for exceptions, not normal role design.</span>
          <Button onClick={saveAccess} disabled={pending}>
            {pending ? 'Saving...' : 'Save Individual Access'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default UserAccessEditor
