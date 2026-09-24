'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  TbAlertTriangle,
  TbBellCheck,
  TbBolt,
  TbCheck,
  TbEyeOff,
  TbPlayerPlay,
  TbSearch,
  TbSettings
} from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { toast } from '@repo/ui/utils/toast'
import {
  acknowledgeForgeAiWatchAlert,
  dismissForgeAiWatchAlert,
  runForgeAiWatchNow,
  saveForgeAiWatchRule
} from './actions'

type Alert = {
  id: string
  rule_key: string
  severity: 'info' | 'warning' | 'high' | 'critical'
  status: string
  target_type: string
  target_reference: string | null
  title: string
  summary: string
  data: Record<string, any>
  first_detected_at: string
  last_detected_at: string
  forge_ai_watch_rules?: {
    name_override?: string | null
    forge_ai_watch_rule_templates?: {
      name?: string
      category?: string
      required_permission_key?: string
    }
  } | null
}

type Rule = {
  id: string
  enabled: boolean
  severity_override: 'info' | 'warning' | 'high' | 'critical' | null
  config: Record<string, any>
  notification_mode: 'in_app' | 'none'
  forge_ai_watch_rule_templates: {
    rule_key: string
    name: string
    description: string | null
    category: string
    severity: 'info' | 'warning' | 'high' | 'critical'
    default_config: Record<string, any>
  }
}

const severityVariant = (severity: string) => {
  if (severity === 'critical') return 'destructive'
  if (severity === 'high') return 'destructive'
  if (severity === 'warning') return 'secondary'
  return 'outline'
}

const ForgeAiWatchPanel = ({
  alerts,
  rules,
  canManage
}: {
  alerts: Alert[]
  rules: Rule[]
  canManage: boolean
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [showRules, setShowRules] = useState(false)
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, {
    enabled: boolean
    severityOverride: 'info' | 'warning' | 'high' | 'critical' | null
    notificationMode: 'in_app' | 'none'
    config: Record<string, any>
  }>>(
    Object.fromEntries(rules.map(rule => [
      rule.id,
      {
        enabled: rule.enabled,
        severityOverride: rule.severity_override,
        notificationMode: rule.notification_mode,
        config: { ...(rule.config || {}) }
      }
    ]))
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return alerts.filter(alert => {
      const matchesSearch =
        !q ||
        alert.title.toLowerCase().includes(q) ||
        alert.summary.toLowerCase().includes(q) ||
        alert.rule_key.toLowerCase().includes(q) ||
        alert.target_reference?.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && ['open','acknowledged'].includes(alert.status)) ||
        alert.status === status

      return matchesSearch && matchesStatus
    })
  }, [alerts, search, status])

  const activeCount = alerts.filter(alert => ['open','acknowledged'].includes(alert.status)).length
  const criticalCount = alerts.filter(alert => ['open','acknowledged'].includes(alert.status) && alert.severity === 'critical').length
  const highCount = alerts.filter(alert => ['open','acknowledged'].includes(alert.status) && alert.severity === 'high').length

  const runNow = () => {
    startTransition(async () => {
      const result = await runForgeAiWatchNow()
      if ('error' in result) {
        toast('error', result.error || 'AI Watch failed.')
        return
      }
      toast('success', result.message)
      window.location.reload()
    })
  }

  const acknowledge = (alertId: string) => {
    startTransition(async () => {
      const result = await acknowledgeForgeAiWatchAlert(alertId)
      if ('error' in result) {
        toast('error', result.error || 'Unable to acknowledge alert.')
        return
      }
      toast('success', result.message)
      window.location.reload()
    })
  }

  const dismiss = (alertId: string) => {
    if (!window.confirm('Dismiss this alert? It will stay hidden while this condition remains active.')) return

    startTransition(async () => {
      const result = await dismissForgeAiWatchAlert(alertId)
      if ('error' in result) {
        toast('error', result.error || 'Unable to dismiss alert.')
        return
      }
      toast('success', result.message)
      window.location.reload()
    })
  }

  const saveRule = (rule: Rule) => {
    const draft = ruleDrafts[rule.id]

    startTransition(async () => {
      const result = await saveForgeAiWatchRule({
        ruleId: rule.id,
        enabled: draft.enabled,
        severityOverride: draft.severityOverride,
        config: draft.config,
        notificationMode: draft.notificationMode
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save AI Watch rule.')
        return
      }

      toast('success', result.message)
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Active Alerts</CardDescription></CardHeader>
          <CardContent><div className='text-3xl font-bold'>{activeCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Critical</CardDescription></CardHeader>
          <CardContent><div className='text-3xl font-bold'>{criticalCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>High Priority</CardDescription></CardHeader>
          <CardContent><div className='text-3xl font-bold'>{highCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <CardTitle className='flex items-center gap-2'><TbBellCheck />Safety Watch</CardTitle>
              <CardDescription className='mt-1'>
                Forge evaluates configured safety conditions and deduplicates recurring alerts.
              </CardDescription>
            </div>
            <div className='flex flex-wrap gap-2'>
              {canManage ? (
                <Button variant='outline' onClick={() => setShowRules(value => !value)}>
                  <TbSettings />
                  {showRules ? 'Hide Rules' : 'Manage Rules'}
                </Button>
              ) : null}
              {canManage ? (
                <Button onClick={runNow} disabled={pending}>
                  <TbPlayerPlay />
                  Run Watch Now
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 md:grid-cols-[1fr_220px]'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input
                className='pl-10'
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search AI Watch alerts...'
              />
            </div>
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
            >
              <option value='active'>Active</option>
              <option value='all'>All</option>
              <option value='open'>Open</option>
              <option value='acknowledged'>Acknowledged</option>
              <option value='resolved'>Resolved</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {showRules && canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Watch Rules</CardTitle>
            <CardDescription>
              These are deterministic Forge monitors. They do not rely on the model inventing whether a condition exists.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            {rules.map(rule => {
              const draft = ruleDrafts[rule.id]
              const configEntries = Object.entries(draft.config || {})

              return (
                <div key={rule.id} className='rounded-xl border p-4'>
                  <div className='flex flex-wrap items-start justify-between gap-4'>
                    <div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <div className='font-semibold'>{rule.forge_ai_watch_rule_templates.name}</div>
                        <Badge size='sm' variant='outline'>{rule.forge_ai_watch_rule_templates.category}</Badge>
                        <Badge size='sm' variant={severityVariant(draft.severityOverride || rule.forge_ai_watch_rule_templates.severity) as any}>
                          {draft.severityOverride || rule.forge_ai_watch_rule_templates.severity}
                        </Badge>
                      </div>
                      <p className='text-textSecondary mt-2 text-sm'>{rule.forge_ai_watch_rule_templates.description}</p>
                      <div className='text-textSecondary mt-1 text-xs'>{rule.forge_ai_watch_rule_templates.rule_key}</div>
                    </div>
                    <Button size='sm' onClick={() => saveRule(rule)} disabled={pending}>Save</Button>
                  </div>

                  <div className='mt-4 grid gap-3 md:grid-cols-3'>
                    <label className='flex items-center gap-3 rounded-lg border p-3'>
                      <Switch
                        checked={draft.enabled}
                        onCheckedChange={value => setRuleDrafts(current => ({
                          ...current,
                          [rule.id]: { ...current[rule.id], enabled: value }
                        }))}
                      />
                      <span className='text-sm font-medium'>Enabled</span>
                    </label>

                    <div>
                      <Label>Severity</Label>
                      <select
                        className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                        value={draft.severityOverride || ''}
                        onChange={event => setRuleDrafts(current => ({
                          ...current,
                          [rule.id]: {
                            ...current[rule.id],
                            severityOverride: event.target.value
                              ? event.target.value as any
                              : null
                          }
                        }))}
                      >
                        <option value=''>Template Default</option>
                        <option value='info'>Info</option>
                        <option value='warning'>Warning</option>
                        <option value='high'>High</option>
                        <option value='critical'>Critical</option>
                      </select>
                    </div>

                    <div>
                      <Label>Notification</Label>
                      <select
                        className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                        value={draft.notificationMode}
                        onChange={event => setRuleDrafts(current => ({
                          ...current,
                          [rule.id]: {
                            ...current[rule.id],
                            notificationMode: event.target.value as 'in_app' | 'none'
                          }
                        }))}
                      >
                        <option value='in_app'>In-App</option>
                        <option value='none'>Do Not Surface</option>
                      </select>
                    </div>

                    {configEntries.map(([key, value]) => (
                      <div key={key}>
                        <Label>{key.replaceAll('_', ' ')}</Label>
                        <Input
                          className='mt-2'
                          type={typeof value === 'number' ? 'number' : 'text'}
                          value={String(value ?? '')}
                          onChange={event => setRuleDrafts(current => ({
                            ...current,
                            [rule.id]: {
                              ...current[rule.id],
                              config: {
                                ...current[rule.id].config,
                                [key]: typeof value === 'number'
                                  ? Number(event.target.value)
                                  : event.target.value
                              }
                            }
                          }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      <div className='flex flex-col gap-4'>
        {filtered.length ? filtered.map(alert => {
          const path = typeof alert.data?.path === 'string' ? alert.data.path : null

          return (
            <Card key={alert.id}>
              <CardContent className='p-5'>
                <div className='flex flex-wrap items-start justify-between gap-4'>
                  <div className='max-w-4xl'>
                    <div className='flex flex-wrap items-center gap-2'>
                      {alert.severity === 'critical' || alert.severity === 'high'
                        ? <TbAlertTriangle className='text-destructive' />
                        : <TbBolt className='text-primary' />}
                      <div className='font-semibold'>{alert.title}</div>
                      <Badge size='sm' variant={severityVariant(alert.severity) as any}>{alert.severity}</Badge>
                      <Badge size='sm' variant={alert.status === 'resolved' ? 'tonalSuccess' : 'outline'}>{alert.status}</Badge>
                    </div>
                    <p className='text-textSecondary mt-2 text-sm'>{alert.summary}</p>
                    <div className='text-textSecondary mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                      <span>{alert.forge_ai_watch_rules?.forge_ai_watch_rule_templates?.name || alert.rule_key}</span>
                      {alert.target_reference ? <span>Reference: {alert.target_reference}</span> : null}
                      <span>Last detected: {new Date(alert.last_detected_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className='flex flex-wrap gap-2'>
                    {path ? <Button size='sm' variant='outline' asChild><Link href={path}>Open Record</Link></Button> : null}
                    {alert.status === 'open' ? (
                      <Button size='sm' variant='outline' onClick={() => acknowledge(alert.id)} disabled={pending}>
                        <TbCheck />
                        Acknowledge
                      </Button>
                    ) : null}
                    {['open','acknowledged'].includes(alert.status) ? (
                      <Button size='sm' variant='outline' onClick={() => dismiss(alert.id)} disabled={pending}>
                        <TbEyeOff />
                        Dismiss
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        }) : (
          <Card>
            <CardContent className='p-10 text-center'>
              <TbBellCheck className='text-primary mx-auto size-8' />
              <div className='mt-3 font-semibold'>No AI Watch alerts match the current filters.</div>
              <div className='text-textSecondary mt-1 text-sm'>
                {canManage ? 'Run AI Watch to evaluate the current tenant data now.' : 'No active conditions are visible in your current scope.'}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default ForgeAiWatchPanel
