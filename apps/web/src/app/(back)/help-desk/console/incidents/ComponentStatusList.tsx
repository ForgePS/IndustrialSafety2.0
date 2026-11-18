'use client'

import { useState } from 'react'

import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'

import { componentStatusLabels } from '@/lib/forgeHelpdesk'
import { ComponentStatusBadge } from '@/components/helpdesk/HelpdeskBadges'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { setComponentStatusAction } from '../actions'

const ComponentRow = ({ component, canEdit }: { component: any; canEdit: boolean }) => {
  const { pending, notice, run } = useActionRunner()
  const [status, setStatus] = useState(component.current_status)
  const [note, setNote] = useState('')
  const dirty = status !== component.current_status

  return (
    <div className='flex flex-col gap-2 px-6 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='font-medium'>{component.name}</p>
          <p className='text-textSecondary text-xs'>Updated {new Date(component.status_updated_at).toLocaleString()}</p>
        </div>
        {canEdit ? (
          <select aria-label={`${component.name} status`} value={status} onChange={e => setStatus(e.target.value)} className='border-input bg-card h-[34px] rounded-md border px-2 text-sm'>
            {Object.entries(componentStatusLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <ComponentStatusBadge status={component.current_status} />
        )}
      </div>
      {dirty ? (
        <div className='flex flex-wrap gap-2'>
          <Input aria-label='Status note' value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder='Internal note (optional)' className='h-[34px] flex-1' />
          <Button type='button' size='sm' disabled={pending} onClick={() => run(() => setComponentStatusAction({ componentId: component.id, status, note }), 'Component status updated.', () => setNote(''))}>
            Save
          </Button>
          <Button type='button' size='sm' variant='ghost' onClick={() => setStatus(component.current_status)}>
            Cancel
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role='status' className={notice.tone === 'error' ? 'text-destructive text-xs' : 'text-xs'}>
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}

const ComponentStatusList = ({ components, canEdit }: { components: any[]; canEdit: boolean }) => (
  <Card>
    <CardHeader>
      <CardTitle>Platform components</CardTitle>
    </CardHeader>
    <CardContent className='flex flex-col divide-y p-0 pb-2'>
      {components.map(c => (
        <ComponentRow key={c.id + c.current_status} component={c} canEdit={canEdit} />
      ))}
    </CardContent>
  </Card>
)

export default ComponentStatusList
