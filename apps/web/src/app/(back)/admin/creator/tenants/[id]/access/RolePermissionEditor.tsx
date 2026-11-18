'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TbAlertTriangle,
  TbCopy,
  TbPlus,
  TbSearch,
  TbTrash
} from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  applyTenantRoleTemplate,
  createTenantRole,
  deleteTenantRole,
  duplicateTenantRole,
  saveTenantRolePermissions
} from './actions'

type Permission = {
  id: string
  permission_key: string
  name: string
  description: string | null
  permission_group: string
  action: string
  scope_options: string[]
  tenant_assignable: boolean
  tenant_can_scope: boolean
  default_scope: string
  is_sensitive: boolean
  requires_confirmation: boolean
  danger_level: 'normal' | 'sensitive' | 'critical'
  sort_order: number
}

type RolePermission = {
  permission_id: string
  allowed: boolean
  scope: string | null
}

type Role = {
  id: string
  name: string
  description: string | null
  role_key: string | null
  is_system_role: boolean
  is_active: boolean
  permissions: RolePermission[]
}

type Template = {
  id: string
  template_key: string
  name: string
  description: string | null
}

type Draft = {
  name: string
  description: string
  grants: Record<string, { allowed: boolean; scope: string }>
}

const scopeLabels: Record<string, string> = {
  own: 'Own Record',
  assigned: 'Assigned Personnel',
  location: 'Location',
  division: 'Division',
  organization: 'Entire Company'
}

const RolePermissionEditor = ({
  organizationId,
  organizationName,
  roles,
  permissions,
  templates
}: {
  organizationId: string
  organizationName: string
  roles: Role[]
  permissions: Permission[]
  templates: Template[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false)

  const selectedRole = useMemo(
    () => roles.find(role => role.id === selectedRoleId) ?? roles[0],
    [roles, selectedRoleId]
  )

  const buildDraft = (role?: Role): Draft => {
    const current = new Map((role?.permissions || []).map(item => [item.permission_id, item]))
    const grants: Draft['grants'] = {}

    permissions.forEach(permission => {
      const existing = current.get(permission.id)
      grants[permission.id] = {
        allowed: Boolean(existing?.allowed),
        scope: existing?.scope || permission.default_scope || 'organization'
      }
    })

    return {
      name: role?.name || '',
      description: role?.description || '',
      grants
    }
  }

  const [draft, setDraft] = useState<Draft>(() => buildDraft(selectedRole))

  const selectRole = (roleId: string) => {
    const role = roles.find(item => item.id === roleId)
    setSelectedRoleId(roleId)
    setDraft(buildDraft(role))
  }

  const groupedPermissions = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = permissions.filter(permission => {
      const enabled = draft.grants[permission.id]?.allowed
      if (showOnlyEnabled && !enabled) return false
      if (!query) return true

      return (
        permission.name.toLowerCase().includes(query) ||
        permission.permission_group.toLowerCase().includes(query) ||
        permission.permission_key.toLowerCase().includes(query) ||
        permission.description?.toLowerCase().includes(query)
      )
    })

    return filtered.reduce<Record<string, Permission[]>>((groups, permission) => {
      groups[permission.permission_group] ||= []
      groups[permission.permission_group].push(permission)
      return groups
    }, {})
  }, [draft.grants, permissions, search, showOnlyEnabled])

  const setAll = (allowed: boolean) => {
    setDraft(current => ({
      ...current,
      grants: Object.fromEntries(
        permissions.map(permission => [
          permission.id,
          {
            allowed,
            scope: current.grants[permission.id]?.scope || permission.default_scope || 'organization'
          }
        ])
      )
    }))
  }

  const setReadOnly = () => {
    setDraft(current => ({
      ...current,
      grants: Object.fromEntries(
        permissions.map(permission => [
          permission.id,
          {
            allowed: permission.action === 'view' && permission.tenant_assignable,
            scope: current.grants[permission.id]?.scope || permission.default_scope || 'organization'
          }
        ])
      )
    }))
  }

  const save = () => {
    if (!selectedRole) return

    startTransition(async () => {
      const result = await saveTenantRolePermissions({
        organizationId,
        roleId: selectedRole.id,
        name: draft.name,
        description: draft.description,
        permissions: permissions.map(permission => ({
          permissionId: permission.id,
          allowed: draft.grants[permission.id]?.allowed || false,
          scope: (draft.grants[permission.id]?.scope || permission.default_scope || 'organization') as
            | 'own'
            | 'assigned'
            | 'location'
            | 'division'
            | 'organization'
        }))
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save permissions.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const createRole = () => {
    const name = window.prompt('New role name')
    if (!name) return

    startTransition(async () => {
      const result = await createTenantRole({
        organizationId,
        name,
        description: 'Custom tenant role'
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to create role.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const duplicateRole = () => {
    if (!selectedRole) return
    const name = window.prompt('Name for the duplicated role', `${selectedRole.name} Copy`)
    if (!name) return

    startTransition(async () => {
      const result = await duplicateTenantRole({
        organizationId,
        roleId: selectedRole.id,
        name
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to duplicate role.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const removeRole = () => {
    if (!selectedRole) return
    if (!window.confirm(`Delete ${selectedRole.name}? This cannot be undone.`)) return

    startTransition(async () => {
      const result = await deleteTenantRole({
        organizationId,
        roleId: selectedRole.id
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to delete role.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const applyTemplate = (templateId: string) => {
    if (!selectedRole || !templateId) return

    startTransition(async () => {
      const result = await applyTenantRoleTemplate({
        organizationId,
        roleId: selectedRole.id,
        templateId
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to apply template.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  if (!roles.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No tenant roles found</CardTitle>
          <CardDescription>Create a role before configuring permissions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={createRole}><TbPlus />Create Role</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className='grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>{organizationName}</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2'>
            {roles.map(role => (
              <button
                type='button'
                key={role.id}
                onClick={() => selectRole(role.id)}
                className={`rounded-lg border p-3 text-left transition ${
                  selectedRole?.id === role.id ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5'
                }`}
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-textPrimary font-semibold'>{role.name}</span>
                  {role.is_system_role ? <Badge size='sm' variant='secondary'>System</Badge> : null}
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{role.description || 'No description'}</div>
              </button>
            ))}
            <Button variant='outline' className='mt-2' onClick={createRole} disabled={pending}>
              <TbPlus />
              New Custom Role
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick setup</CardTitle>
            <CardDescription>Apply a safe starting point, then fine-tune permissions.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <select
              defaultValue=''
              onChange={event => {
                applyTemplate(event.target.value)
                event.target.value = ''
              }}
              className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
              disabled={pending}
            >
              <option value=''>Apply role template...</option>
              {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <Button variant='outline' onClick={setReadOnly}>Read Only</Button>
            <Button variant='outline' onClick={() => setAll(true)}>Full Access</Button>
            <Button variant='outline' onClick={() => setAll(false)}>Clear All</Button>
          </CardContent>
        </Card>
      </div>

      <div className='flex flex-col gap-6'>
        <Card>
          <CardHeader>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div>
                <CardTitle>{selectedRole?.name}</CardTitle>
                <CardDescription>
                  Toggle individual capabilities and select how broadly each permission applies.
                </CardDescription>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button variant='outline' onClick={duplicateRole} disabled={pending}>
                  <TbCopy />
                  Duplicate
                </Button>
                {!selectedRole?.is_system_role ? (
                  <Button variant='destructive' onClick={removeRole} disabled={pending}>
                    <TbTrash />
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <Label htmlFor='role-name'>Role name</Label>
              <Input
                id='role-name'
                value={draft.name}
                onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                className='mt-2'
              />
            </div>
            <div className='md:col-span-2'>
              <Label htmlFor='role-description'>Description</Label>
              <Textarea
                id='role-description'
                value={draft.description}
                onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                rows={2}
                className='mt-2'
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='grid gap-4 p-5 lg:grid-cols-[1fr_auto]'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search permissions...'
                className='pl-10'
              />
            </div>
            <label className='flex items-center gap-3'>
              <Switch checked={showOnlyEnabled} onCheckedChange={setShowOnlyEnabled} />
              <span className='text-sm'>Show enabled only</span>
            </label>
          </CardContent>
        </Card>

        {Object.entries(groupedPermissions).map(([group, groupPermissions]) => {
          const enabledCount = groupPermissions.filter(permission => draft.grants[permission.id]?.allowed).length

          return (
            <Card key={group}>
              <CardHeader>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <CardTitle>{group}</CardTitle>
                    <CardDescription>{enabledCount} of {groupPermissions.length} enabled</CardDescription>
                  </div>
                  <div className='flex gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setDraft(current => ({
                          ...current,
                          grants: {
                            ...current.grants,
                            ...Object.fromEntries(
                              groupPermissions.map(permission => [
                                permission.id,
                                {
                                  allowed: true,
                                  scope: current.grants[permission.id]?.scope || permission.default_scope || 'organization'
                                }
                              ])
                            )
                          }
                        }))
                      }}
                    >
                      Enable Group
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setDraft(current => ({
                          ...current,
                          grants: {
                            ...current.grants,
                            ...Object.fromEntries(
                              groupPermissions.map(permission => [
                                permission.id,
                                {
                                  allowed: false,
                                  scope: current.grants[permission.id]?.scope || permission.default_scope || 'organization'
                                }
                              ])
                            )
                          }
                        }))
                      }}
                    >
                      Clear Group
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='divide-y'>
                {groupPermissions
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(permission => {
                    const grant = draft.grants[permission.id]
                    const isCritical = permission.danger_level === 'critical'

                    return (
                      <div key={permission.id} className='grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto_220px] lg:items-center'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span className='text-textPrimary font-medium'>{permission.name}</span>
                            {permission.is_sensitive ? <Badge size='sm' variant='secondary'>Sensitive</Badge> : null}
                            {isCritical ? (
                              <Badge size='sm' variant='destructive'>
                                <TbAlertTriangle />
                                Critical
                              </Badge>
                            ) : null}
                          </div>
                          <p className='text-textSecondary mt-1 text-sm'>{permission.description || permission.permission_key}</p>
                        </div>

                        <div className='flex items-center gap-3'>
                          <span className='text-textSecondary text-sm'>{grant?.allowed ? 'On' : 'Off'}</span>
                          <Switch
                            checked={grant?.allowed || false}
                            onCheckedChange={checked =>
                              setDraft(current => ({
                                ...current,
                                grants: {
                                  ...current.grants,
                                  [permission.id]: {
                                    allowed: checked,
                                    scope: current.grants[permission.id]?.scope || permission.default_scope || 'organization'
                                  }
                                }
                              }))
                            }
                          />
                        </div>

                        <div>
                          {permission.tenant_can_scope && grant?.allowed ? (
                            <select
                              value={grant.scope}
                              onChange={event =>
                                setDraft(current => ({
                                  ...current,
                                  grants: {
                                    ...current.grants,
                                    [permission.id]: {
                                      allowed: true,
                                      scope: event.target.value
                                    }
                                  }
                                }))
                              }
                              className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
                            >
                              {(permission.scope_options || ['organization']).map(scope => (
                                <option key={scope} value={scope}>{scopeLabels[scope] || scope}</option>
                              ))}
                            </select>
                          ) : (
                            <span className='text-textSecondary text-sm'>Company-wide setting</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          )
        })}

        <div className='sticky bottom-4 z-10 flex justify-end'>
          <div className='bg-card flex items-center gap-3 rounded-xl border p-3 shadow-lg'>
            <span className='text-textSecondary text-sm'>
              {Object.values(draft.grants).filter(item => item.allowed).length} permissions enabled
            </span>
            <Button onClick={save} disabled={pending}>
              {pending ? 'Saving...' : 'Save Role Permissions'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RolePermissionEditor
