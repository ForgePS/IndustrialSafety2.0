'use client'

import { useState, useTransition } from 'react'

import { TbBell, TbPlus, TbTrash } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { deleteForgeAiAlertRoute, saveForgeAiAlertRoute } from './actions'

export type AlertRoute = {
  id: string
  rule_key: string | null
  min_severity: 'info' | 'warning' | 'high' | 'critical'
  recipient_type: 'tenant_role' | 'user'
  tenant_role_id: string | null
  user_id: string | null
  channel: 'in_app' | 'email'
}

type Option = { id: string; label: string }

const selectClass = 'border-input bg-card h-9 w-full rounded-md border px-2 text-sm'

const AlertRoutesCard = ({
  routes,
  roles,
  members,
  rules,
  defaultRoleNames
}: {
  routes: AlertRoute[]
  roles: Option[]
  members: Option[]
  rules: Array<{ rule_key: string; name: string }>
  defaultRoleNames: string[]
}) => {
  const [pending, startTransition] = useTransition()
  const [recipientType, setRecipientType] = useState<'tenant_role' | 'user'>('tenant_role')
  const [recipientId, setRecipientId] = useState(roles[0]?.id || '')
  const [ruleKey, setRuleKey] = useState('')
  const [minSeverity, setMinSeverity] = useState<AlertRoute['min_severity']>('high')
  const [channel, setChannel] = useState<AlertRoute['channel']>('in_app')

  const nameFor = (route: AlertRoute) =>
    route.recipient_type === 'tenant_role'
      ? (roles.find(role => role.id === route.tenant_role_id)?.label || 'Role') + ' (role)'
      : members.find(member => member.id === route.user_id)?.label || 'Member'

  const run = (task: () => Promise<{ message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await task()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
    })

  const recipients = recipientType === 'tenant_role' ? roles : members

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TbBell />
          Alert Routing
        </CardTitle>
        <CardDescription>
          Who is notified when Watch opens an alert. People only receive alerts for records and locations they can already open.
          {routes.length ? null : ` No routes yet, so ${defaultRoleNames.join(' and ')} receive high and critical alerts in the app.`}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {routes.length ? (
          <div className='flex flex-col divide-y rounded-lg border' data-testid='alert-routes'>
            {routes.map(route => (
              <div key={route.id} className='flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='font-semibold'>{nameFor(route)}</span>
                  <Badge size='sm' variant='outline'>
                    {route.min_severity}+
                  </Badge>
                  <Badge size='sm' variant='outline'>
                    {route.channel === 'email' ? 'Email' : 'In app'}
                  </Badge>
                  <span className='text-textSecondary text-xs'>
                    {route.rule_key ? rules.find(rule => rule.rule_key === route.rule_key)?.name || route.rule_key : 'All rules'}
                  </span>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={pending}
                  onClick={() => run(() => deleteForgeAiAlertRoute(route.id))}
                  aria-label={'Remove route for ' + nameFor(route)}
                >
                  <TbTrash />
                </Button>
              </div>
            ))}
          </div>
        ) : null}

        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-6'>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='route-recipient-type'>Send to</Label>
            <select
              id='route-recipient-type'
              className={selectClass}
              value={recipientType}
              onChange={event => {
                const next = event.target.value as 'tenant_role' | 'user'

                setRecipientType(next)
                setRecipientId((next === 'tenant_role' ? roles : members)[0]?.id || '')
              }}
            >
              <option value='tenant_role'>Role</option>
              <option value='user'>Person</option>
            </select>
          </div>
          <div className='flex flex-col gap-1 lg:col-span-2'>
            <Label htmlFor='route-recipient'>{recipientType === 'tenant_role' ? 'Role' : 'Person'}</Label>
            <select id='route-recipient' className={selectClass} value={recipientId} onChange={event => setRecipientId(event.target.value)}>
              {recipients.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='route-rule'>Rule</Label>
            <select id='route-rule' className={selectClass} value={ruleKey} onChange={event => setRuleKey(event.target.value)}>
              <option value=''>All rules</option>
              {rules.map(rule => (
                <option key={rule.rule_key} value={rule.rule_key}>
                  {rule.name}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='route-severity'>Minimum severity</Label>
            <select
              id='route-severity'
              className={selectClass}
              value={minSeverity}
              onChange={event => setMinSeverity(event.target.value as AlertRoute['min_severity'])}
            >
              <option value='info'>Info</option>
              <option value='warning'>Warning</option>
              <option value='high'>High</option>
              <option value='critical'>Critical</option>
            </select>
          </div>
          <div className='flex flex-col gap-1'>
            <Label htmlFor='route-channel'>Channel</Label>
            <select id='route-channel' className={selectClass} value={channel} onChange={event => setChannel(event.target.value as AlertRoute['channel'])}>
              <option value='in_app'>In app</option>
              <option value='email'>Email</option>
            </select>
          </div>
        </div>
        <div>
          <Button
            disabled={pending || !recipientId}
            onClick={() =>
              run(() => saveForgeAiAlertRoute({ recipientType, recipientId, ruleKey: ruleKey || null, minSeverity, channel }))
            }
          >
            <TbPlus />
            Add Route
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default AlertRoutesCard
