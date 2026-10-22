'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  acknowledgeParticipantAction,
  addExecutionParticipantAction,
  completeExecutionAction,
  removeExecutionParticipantAction,
  transitionExecutionAction
} from './actions'

type PersonOption = { id: string; label: string }

export const AcknowledgeButton = ({
  jsaId,
  executionId
}: {
  jsaId: string
  executionId: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await acknowledgeParticipantAction({ jsaId, executionId })
          if (!result.ok) {
            toast('error', result.error || 'Unable to acknowledge.')
            return
          }
          toast('success', result.message)
          router.refresh()
        })
      }}
    >
      {pending ? 'Saving...' : 'Acknowledge participation'}
    </Button>
  )
}

export const ExecutionCrewPanel = ({
  jsaId,
  executionId,
  status,
  personnel,
  canManage,
  participants
}: {
  jsaId: string
  executionId: string
  status: string
  personnel: PersonOption[]
  canManage: boolean
  participants: Array<{
    id: string
    role: string
    acknowledged_at: string | null
    name: string
    personnel_id: string
  }>
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [personnelId, setPersonnelId] = useState('')
  const [role, setRole] = useState('crew')

  if (!canManage) return null

  const canEditCrew = status === 'planned' || status === 'briefing' || status === 'stopped'

  return (
    <div className='grid gap-3'>
      {canEditCrew ? (
        <div className='flex flex-wrap items-end gap-2'>
          <div className='grid min-w-[220px] flex-1 gap-1'>
            <Label htmlFor='crew-person'>Add crew</Label>
            <select
              id='crew-person'
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
              value={personnelId}
              onChange={event => setPersonnelId(event.target.value)}
              disabled={pending}
            >
              <option value=''>Select personnel</option>
              {personnel.map(person => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </select>
          </div>
          <div className='grid gap-1'>
            <Label htmlFor='crew-role'>Role</Label>
            <select
              id='crew-role'
              className='border-input bg-background h-10 rounded-md border px-3 text-sm'
              value={role}
              onChange={event => setRole(event.target.value)}
              disabled={pending}
            >
              <option value='crew'>Crew</option>
              <option value='lead'>Lead</option>
            </select>
          </div>
          <Button
            disabled={pending || !personnelId}
            onClick={() => {
              startTransition(async () => {
                const result = await addExecutionParticipantAction({
                  jsaId,
                  executionId,
                  personnelId,
                  role
                })
                if (!result.ok) {
                  toast('error', result.error || 'Unable to add crew.')
                  return
                }
                toast('success', result.message)
                setPersonnelId('')
                router.refresh()
              })
            }}
          >
            Add
          </Button>
        </div>
      ) : null}

      <ul className='grid gap-2'>
        {participants.map(participant => (
          <li
            key={participant.id}
            className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm'
          >
            <div>
              <div className='font-medium'>{participant.name}</div>
              <div className='text-textSecondary'>{participant.role}</div>
            </div>
            <div className='flex items-center gap-2'>
              <span className='text-textSecondary text-xs'>
                {participant.acknowledged_at ? 'Acknowledged' : 'Pending ack'}
              </span>
              {!participant.acknowledged_at &&
              (status === 'planned' || status === 'briefing' || status === 'stopped') ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={pending}
                  data-testid={'ack-participant-' + participant.personnel_id}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await acknowledgeParticipantAction({
                        jsaId,
                        executionId,
                        personnelId: participant.personnel_id
                      })
                      if (!result.ok) {
                        toast('error', result.error || 'Unable to acknowledge.')
                        return
                      }
                      toast('success', result.message)
                      router.refresh()
                    })
                  }}
                >
                  Record acknowledgment
                </Button>
              ) : null}
              {canEditCrew ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeExecutionParticipantAction({
                        jsaId,
                        executionId,
                        participantId: participant.id
                      })
                      if (!result.ok) {
                        toast('error', result.error || 'Unable to remove.')
                        return
                      }
                      toast('success', result.message)
                      router.refresh()
                    })
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const ExecutionLifecycleControls = ({
  jsaId,
  executionId,
  status,
  canManage,
  allRequiredAcked
}: {
  jsaId: string
  executionId: string
  status: string
  canManage: boolean
  allRequiredAcked: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [stopReason, setStopReason] = useState('')

  if (!canManage) return null

  const runTransition = (toStatus: string, extra?: { stopReason?: string }) => {
    startTransition(async () => {
      const result = await transitionExecutionAction({
        jsaId,
        executionId,
        toStatus,
        stopReason: extra?.stopReason || null,
        stopRequiresRevision: toStatus === 'stopped'
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to transition execution.')
        return
      }
      toast('success', result.message)
      router.refresh()
    })
  }

  return (
    <div className='grid gap-3'>
      {status === 'planned' ? (
        <Button disabled={pending} onClick={() => runTransition('briefing')}>
          Start briefing
        </Button>
      ) : null}

      {status === 'briefing' ? (
        <Button
          disabled={pending || !allRequiredAcked}
          onClick={() => runTransition('active')}
          title={!allRequiredAcked ? 'All required participants must acknowledge first.' : undefined}
        >
          {allRequiredAcked ? 'Activate work' : 'Activate work (acks required)'}
        </Button>
      ) : null}

      {status === 'active' ? (
        <div className='grid gap-2'>
          <Label htmlFor='stop-reason'>Stop-work reason</Label>
          <Textarea
            id='stop-reason'
            rows={2}
            value={stopReason}
            onChange={event => setStopReason(event.target.value)}
            disabled={pending}
            placeholder='Reason for stop-work'
          />
          <Button
            variant='destructive'
            disabled={pending || !stopReason.trim()}
            onClick={() => runTransition('stopped', { stopReason })}
          >
            Stop work
          </Button>
        </div>
      ) : null}

      {status === 'stopped' ? (
        <Button disabled={pending} onClick={() => runTransition('briefing')}>
          Resume briefing
        </Button>
      ) : null}

      {['planned', 'briefing', 'stopped'].includes(status) ? (
        <Button
          variant='outline'
          disabled={pending}
          onClick={() => runTransition('canceled')}
        >
          Cancel execution
        </Button>
      ) : null}
    </div>
  )
}

export const CompleteExecutionForm = ({
  jsaId,
  executionId,
  initialNotes,
  status
}: {
  jsaId: string
  executionId: string
  initialNotes: string | null
  status: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState(initialNotes || '')

  if (status !== 'active') return null

  return (
    <div className='grid gap-3'>
      <Textarea
        rows={3}
        value={notes}
        onChange={event => setNotes(event.target.value)}
        disabled={pending}
        placeholder='Completion notes'
      />
      <Button
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const result = await completeExecutionAction({ jsaId, executionId, notes })
            if (!result.ok) {
              toast('error', result.error || 'Unable to complete execution.')
              return
            }
            toast('success', result.message)
            router.refresh()
          })
        }}
      >
        {pending ? 'Completing...' : 'Mark completed'}
      </Button>
    </div>
  )
}
