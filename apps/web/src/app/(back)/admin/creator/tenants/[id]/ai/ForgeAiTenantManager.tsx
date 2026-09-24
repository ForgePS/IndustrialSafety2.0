'use client'

import { useMemo, useState, useTransition } from 'react'
import { TbBrain, TbSearch, TbShieldLock } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  saveCreatorForgeAiAction,
  saveCreatorForgeAiCapability,
  saveCreatorForgeAiSettings
} from './actions'

type Settings = {
  enabled: boolean
  assistant_name: string
  model: string
  reasoning_effort: 'none' | 'low' | 'medium' | 'high'
  response_style: 'concise' | 'professional' | 'detailed'
  system_instructions: string | null
  allow_sensitive_data: boolean
  action_mode: 'read_only' | 'approval_required' | 'enabled'
  tenant_can_configure: boolean
  monthly_token_budget: number | null
  max_input_chars: number
  max_output_tokens: number
  max_tool_calls: number
  requests_per_minute: number
  data_retention_days: number
}

type Capability = {
  id: string
  capability_key: string
  name: string
  description: string | null
  category: string
  required_permission_key: string | null
  capability_type: string
  platform_enabled: boolean
  sensitive: boolean
  requires_approval: boolean
  enabled: boolean
  tenantCanConfigure: boolean
}

type AiAction = {
  id: string
  action_key: string
  name: string
  description: string | null
  category: string
  target_type: string
  required_permission_key: string
  risk_level: string
  platform_enabled: boolean
  requires_approval: boolean
  allow_self_approval: boolean
  enabled: boolean
  tenantCanConfigure: boolean
}

const ForgeAiTenantManager = ({
  organizationId,
  settings,
  capabilities,
  actions
}: {
  organizationId: string
  settings: Settings
  capabilities: Capability[]
  actions: AiAction[]
}) => {
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState({
    enabled: settings.enabled,
    assistantName: settings.assistant_name,
    model: settings.model,
    reasoningEffort: settings.reasoning_effort,
    responseStyle: settings.response_style,
    systemInstructions: settings.system_instructions || '',
    allowSensitiveData: settings.allow_sensitive_data,
    actionMode: settings.action_mode,
    tenantCanConfigure: settings.tenant_can_configure,
    monthlyTokenBudget: settings.monthly_token_budget == null ? '' : String(settings.monthly_token_budget),
    maxInputChars: settings.max_input_chars,
    maxOutputTokens: settings.max_output_tokens,
    maxToolCalls: settings.max_tool_calls,
    requestsPerMinute: settings.requests_per_minute,
    dataRetentionDays: settings.data_retention_days
  })
  const [capabilityDrafts, setCapabilityDrafts] = useState<Record<string, { enabled: boolean; tenantCanConfigure: boolean }>>(
    Object.fromEntries(capabilities.map(item => [
      item.id,
      {
        enabled: item.enabled,
        tenantCanConfigure: item.tenantCanConfigure
      }
    ]))
  )
  const [actionDrafts, setActionDrafts] = useState<Record<string, { enabled: boolean; tenantCanConfigure: boolean }>>(
    Object.fromEntries(actions.map(item => [
      item.id,
      {
        enabled: item.enabled,
        tenantCanConfigure: item.tenantCanConfigure
      }
    ]))
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return capabilities.filter(item =>
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.capability_key.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q)
    )
  }, [capabilities, search])

  const saveSettings = () => {
    startTransition(async () => {
      const result = await saveCreatorForgeAiSettings({
        organizationId,
        enabled: draft.enabled,
        assistantName: draft.assistantName,
        model: draft.model,
        reasoningEffort: draft.reasoningEffort,
        responseStyle: draft.responseStyle,
        systemInstructions: draft.systemInstructions,
        allowSensitiveData: draft.allowSensitiveData,
        actionMode: draft.actionMode,
        tenantCanConfigure: draft.tenantCanConfigure,
        monthlyTokenBudget: draft.monthlyTokenBudget ? Number(draft.monthlyTokenBudget) : null,
        maxInputChars: Number(draft.maxInputChars),
        maxOutputTokens: Number(draft.maxOutputTokens),
        maxToolCalls: Number(draft.maxToolCalls),
        requestsPerMinute: Number(draft.requestsPerMinute),
        dataRetentionDays: Number(draft.dataRetentionDays)
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save Forge AI settings.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveCapability = (capability: Capability) => {
    const state = capabilityDrafts[capability.id]

    startTransition(async () => {
      const result = await saveCreatorForgeAiCapability({
        organizationId,
        capabilityId: capability.id,
        enabled: state.enabled,
        tenantCanConfigure: state.tenantCanConfigure
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save AI capability.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveAction = (action: AiAction) => {
    const state = actionDrafts[action.id]

    startTransition(async () => {
      const result = await saveCreatorForgeAiAction({
        organizationId,
        actionId: action.id,
        enabled: state.enabled,
        tenantCanConfigure: state.tenantCanConfigure
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save AI action.')
        return
      }

      toast('success', result.message)
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <div className='flex items-center gap-3'>
                <TbBrain className='text-primary size-6' />
                <CardTitle>Assistant Configuration</CardTitle>
              </div>
              <CardDescription className='mt-2'>
                Forge controls the AI model, safety boundaries, usage limits, sensitive-data policy and tenant configurability.
              </CardDescription>
            </div>
            <Button onClick={saveSettings} disabled={pending}>Save AI Settings</Button>
          </div>
        </CardHeader>
        <CardContent className='grid gap-5 lg:grid-cols-2'>
          <label className='flex items-start gap-3 rounded-lg border p-4'>
            <Switch checked={draft.enabled} onCheckedChange={value => setDraft(current => ({ ...current, enabled: value }))} />
            <span>
              <span className='block font-medium'>Forge AI Enabled</span>
              <span className='text-textSecondary mt-1 block text-xs'>Master runtime switch for this tenant.</span>
            </span>
          </label>

          <label className='flex items-start gap-3 rounded-lg border p-4'>
            <Switch checked={draft.tenantCanConfigure} onCheckedChange={value => setDraft(current => ({ ...current, tenantCanConfigure: value }))} />
            <span>
              <span className='block font-medium'>Tenant Admin Can Configure Allowed Settings</span>
              <span className='text-textSecondary mt-1 block text-xs'>Forge remains the upper control plane.</span>
            </span>
          </label>

          <div>
            <Label>Assistant Name</Label>
            <Input className='mt-2' value={draft.assistantName} onChange={event => setDraft(current => ({ ...current, assistantName: event.target.value }))} />
          </div>

          <div>
            <Label>Model</Label>
            <Input className='mt-2' value={draft.model} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))} />
            <p className='text-textSecondary mt-1 text-xs'>Server-side model ID. Keep this configurable so Forge can change models without code changes.</p>
          </div>

          <div>
            <Label>Reasoning Effort</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              value={draft.reasoningEffort}
              onChange={event => setDraft(current => ({ ...current, reasoningEffort: event.target.value as any }))}
            >
              <option value='none'>None</option>
              <option value='low'>Low</option>
              <option value='medium'>Medium</option>
              <option value='high'>High</option>
            </select>
          </div>

          <div>
            <Label>Response Style</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              value={draft.responseStyle}
              onChange={event => setDraft(current => ({ ...current, responseStyle: event.target.value as any }))}
            >
              <option value='concise'>Concise</option>
              <option value='professional'>Professional</option>
              <option value='detailed'>Detailed</option>
            </select>
          </div>

          <div>
            <Label>Action Mode</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              value={draft.actionMode}
              onChange={event => setDraft(current => ({ ...current, actionMode: event.target.value as any }))}
            >
              <option value='read_only'>Read Only</option>
              <option value='approval_required'>Approval Required</option>
              <option value='enabled'>Enabled for Approved Action Tools</option>
            </select>
          </div>

          <label className='flex items-start gap-3 rounded-lg border p-4'>
            <Switch checked={draft.allowSensitiveData} onCheckedChange={value => setDraft(current => ({ ...current, allowSensitiveData: value }))} />
            <span>
              <span className='flex items-center gap-2 font-medium'><TbShieldLock />Permit Sensitive AI Capabilities</span>
              <span className='text-textSecondary mt-1 block text-xs'>Users must still have both the underlying sensitive-data permission and forge_ai.view_sensitive.</span>
            </span>
          </label>

          <div className='lg:col-span-2'>
            <Label>Tenant-Specific Assistant Instructions</Label>
            <Textarea
              className='mt-2'
              rows={6}
              value={draft.systemInstructions}
              onChange={event => setDraft(current => ({ ...current, systemInstructions: event.target.value }))}
              placeholder='Optional company terminology, internal safety-process guidance, preferred response conventions...'
            />
          </div>

          <div>
            <Label>Monthly Token Budget</Label>
            <Input className='mt-2' type='number' min='1' value={draft.monthlyTokenBudget} onChange={event => setDraft(current => ({ ...current, monthlyTokenBudget: event.target.value }))} placeholder='Unlimited when blank' />
          </div>
          <div>
            <Label>Requests per Minute / User</Label>
            <Input className='mt-2' type='number' min='1' max='120' value={draft.requestsPerMinute} onChange={event => setDraft(current => ({ ...current, requestsPerMinute: Number(event.target.value) }))} />
          </div>
          <div>
            <Label>Maximum Input Characters</Label>
            <Input className='mt-2' type='number' value={draft.maxInputChars} onChange={event => setDraft(current => ({ ...current, maxInputChars: Number(event.target.value) }))} />
          </div>
          <div>
            <Label>Maximum Output Tokens</Label>
            <Input className='mt-2' type='number' value={draft.maxOutputTokens} onChange={event => setDraft(current => ({ ...current, maxOutputTokens: Number(event.target.value) }))} />
          </div>
          <div>
            <Label>Maximum Tool Calls / Request</Label>
            <Input className='mt-2' type='number' min='0' max='30' value={draft.maxToolCalls} onChange={event => setDraft(current => ({ ...current, maxToolCalls: Number(event.target.value) }))} />
          </div>
          <div>
            <Label>Forge Conversation Retention (Days)</Label>
            <Input className='mt-2' type='number' min='1' max='3650' value={draft.dataRetentionDays} onChange={event => setDraft(current => ({ ...current, dataRetentionDays: Number(event.target.value) }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Capabilities</CardTitle>
          <CardDescription>
            A capability must be enabled here and the individual user must also hold its required Forge permission and scope.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='relative mb-5'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search AI capabilities...' className='pl-10' />
          </div>

          <div className='flex flex-col gap-3'>
            {filtered.map(capability => {
              const state = capabilityDrafts[capability.id]

              return (
                <div key={capability.id} className='rounded-xl border p-4'>
                  <div className='flex flex-wrap items-start justify-between gap-4'>
                    <div className='max-w-3xl'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <div className='font-semibold'>{capability.name}</div>
                        <Badge size='sm' variant='outline'>{capability.category}</Badge>
                        <Badge size='sm' variant={capability.capability_type === 'action' ? 'destructive' : 'secondary'}>{capability.capability_type}</Badge>
                        {capability.sensitive ? <Badge size='sm' variant='destructive'>Sensitive</Badge> : null}
                        {capability.requires_approval ? <Badge size='sm' variant='outline'>Approval Required</Badge> : null}
                        {!capability.platform_enabled ? <Badge size='sm' variant='destructive'>Platform Disabled</Badge> : null}
                      </div>
                      <p className='text-textSecondary mt-2 text-sm'>{capability.description}</p>
                      <div className='text-textSecondary mt-2 text-xs'>
                        {capability.capability_key}
                        {capability.required_permission_key ? ' · Requires ' + capability.required_permission_key : ''}
                      </div>
                    </div>
                    <Button size='sm' onClick={() => saveCapability(capability)} disabled={pending}>Save</Button>
                  </div>

                  <div className='mt-4 grid gap-3 md:grid-cols-2'>
                    <label className='flex items-center gap-3 rounded-lg border p-3'>
                      <Switch
                        checked={state.enabled}
                        disabled={!capability.platform_enabled}
                        onCheckedChange={value => setCapabilityDrafts(current => ({
                          ...current,
                          [capability.id]: { ...current[capability.id], enabled: value }
                        }))}
                      />
                      <span className='text-sm font-medium'>Enabled for Tenant</span>
                    </label>

                    <label className='flex items-center gap-3 rounded-lg border p-3'>
                      <Switch
                        checked={state.tenantCanConfigure}
                        onCheckedChange={value => setCapabilityDrafts(current => ({
                          ...current,
                          [capability.id]: { ...current[capability.id], tenantCanConfigure: value }
                        }))}
                      />
                      <span className='text-sm font-medium'>Tenant Admin May Toggle</span>
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved AI Actions</CardTitle>
          <CardDescription>
            Control which write actions Forge AI may prepare for this tenant. Every enabled action still requires the user's underlying Forge permission, record scope, and human approval before execution.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {actions.length ? actions.map(action => {
            const state = actionDrafts[action.id]

            return (
              <div key={action.id} className='rounded-xl border p-4'>
                <div className='flex flex-wrap items-start justify-between gap-4'>
                  <div className='max-w-3xl'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <div className='font-semibold'>{action.name}</div>
                      <Badge size='sm' variant='outline'>{action.category}</Badge>
                      <Badge size='sm' variant={action.risk_level === 'critical' ? 'destructive' : 'secondary'}>{action.risk_level} risk</Badge>
                      {action.requires_approval ? <Badge size='sm' variant='outline'>Human Approval</Badge> : null}
                      {!action.platform_enabled ? <Badge size='sm' variant='destructive'>Platform Disabled</Badge> : null}
                    </div>
                    <p className='text-textSecondary mt-2 text-sm'>{action.description}</p>
                    <div className='text-textSecondary mt-2 text-xs'>
                      {action.action_key} · Requires {action.required_permission_key} · Target {action.target_type}
                    </div>
                  </div>

                  <Button size='sm' onClick={() => saveAction(action)} disabled={pending}>Save</Button>
                </div>

                <div className='mt-4 grid gap-3 md:grid-cols-2'>
                  <label className='flex items-center gap-3 rounded-lg border p-3'>
                    <Switch
                      checked={state.enabled}
                      disabled={!action.platform_enabled}
                      onCheckedChange={value => setActionDrafts(current => ({
                        ...current,
                        [action.id]: { ...current[action.id], enabled: value }
                      }))}
                    />
                    <span className='text-sm font-medium'>Enabled for Tenant</span>
                  </label>

                  <label className='flex items-center gap-3 rounded-lg border p-3'>
                    <Switch
                      checked={state.tenantCanConfigure}
                      onCheckedChange={value => setActionDrafts(current => ({
                        ...current,
                        [action.id]: { ...current[action.id], tenantCanConfigure: value }
                      }))}
                    />
                    <span className='text-sm font-medium'>Tenant Admin May Toggle</span>
                  </label>
                </div>
              </div>
            )
          }) : (
            <div className='text-textSecondary py-8 text-center text-sm'>No AI actions are registered.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ForgeAiTenantManager
