'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Switch } from '@repo/ui/components/ui/switch'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { saveTenantForgeAiCapability, saveTenantForgeAiSettings } from './actions'

type Capability = {
  id: string
  name: string
  description: string | null
  category: string
  capability_type: string
  enabled: boolean
  tenantCanConfigure: boolean
}

const TenantForgeAiSettings = ({
  assistantName,
  responseStyle,
  systemInstructions,
  capabilities,
  tenantCanConfigure
}: {
  assistantName: string
  responseStyle: 'concise' | 'professional' | 'detailed'
  systemInstructions: string | null
  capabilities: Capability[]
  tenantCanConfigure: boolean
}) => {
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({
    assistantName,
    responseStyle,
    systemInstructions: systemInstructions || ''
  })
  const [capabilityDrafts, setCapabilityDrafts] = useState<Record<string, boolean>>(
    Object.fromEntries(capabilities.map(item => [item.id, item.enabled]))
  )

  const saveSettings = () => {
    startTransition(async () => {
      const result = await saveTenantForgeAiSettings({
        assistantName: draft.assistantName,
        responseStyle: draft.responseStyle,
        systemInstructions: draft.systemInstructions
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save Forge AI settings.')
        return
      }

      toast('success', result.message)
    })
  }

  const saveCapability = (capability: Capability) => {
    startTransition(async () => {
      const result = await saveTenantForgeAiCapability({
        capabilityId: capability.id,
        enabled: capabilityDrafts[capability.id]
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to update AI capability.')
        return
      }

      toast('success', result.message)
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      {!tenantCanConfigure ? (
        <Card>
          <CardHeader>
            <CardTitle>Creator Controlled</CardTitle>
            <CardDescription>Forge Creator has locked tenant-level AI configuration. Current settings are shown read-only.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <CardTitle>Tenant Assistant Experience</CardTitle>
              <CardDescription>Customize the settings Forge Creator has exposed to your company.</CardDescription>
            </div>
            {tenantCanConfigure ? <Button onClick={saveSettings} disabled={pending}>Save Settings</Button> : null}
          </div>
        </CardHeader>
        <CardContent className='grid gap-5 md:grid-cols-2'>
          <div>
            <Label>Assistant Name</Label>
            <Input className='mt-2' disabled={!tenantCanConfigure} value={draft.assistantName} onChange={event => setDraft(current => ({ ...current, assistantName: event.target.value }))} />
          </div>

          <div>
            <Label>Response Style</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
              disabled={!tenantCanConfigure}
              value={draft.responseStyle}
              onChange={event => setDraft(current => ({ ...current, responseStyle: event.target.value as any }))}
            >
              <option value='concise'>Concise</option>
              <option value='professional'>Professional</option>
              <option value='detailed'>Detailed</option>
            </select>
          </div>

          <div className='md:col-span-2'>
            <Label>Company-Specific AI Guidance</Label>
            <Textarea
              className='mt-2'
              rows={6}
              disabled={!tenantCanConfigure}
              value={draft.systemInstructions}
              onChange={event => setDraft(current => ({ ...current, systemInstructions: event.target.value }))}
              placeholder='Company terminology, preferred workflows, internal safety program language...'
            />
            <p className='text-textSecondary mt-2 text-xs'>These instructions cannot override Forge security, permissions, sensitive-data controls, or platform safety boundaries.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant-Configurable Capabilities</CardTitle>
          <CardDescription>Only capabilities explicitly delegated by Forge Creator can be changed here.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {capabilities.length ? capabilities.map(capability => (
            <div key={capability.id} className='rounded-lg border p-4'>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div className='max-w-3xl'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <div className='font-semibold'>{capability.name}</div>
                    <Badge size='sm' variant='outline'>{capability.category}</Badge>
                    <Badge size='sm' variant='secondary'>{capability.capability_type}</Badge>
                  </div>
                  <p className='text-textSecondary mt-2 text-sm'>{capability.description}</p>
                </div>

                <div className='flex items-center gap-3'>
                  <Switch
                    checked={capabilityDrafts[capability.id]}
                    disabled={!tenantCanConfigure || !capability.tenantCanConfigure || pending}
                    onCheckedChange={value => setCapabilityDrafts(current => ({ ...current, [capability.id]: value }))}
                  />
                  {tenantCanConfigure && capability.tenantCanConfigure ? (
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => saveCapability(capability)}>Save</Button>
                  ) : (
                    <Badge size='sm' variant='outline'>Creator Locked</Badge>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className='text-textSecondary py-8 text-center text-sm'>No AI capabilities are available.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default TenantForgeAiSettings
