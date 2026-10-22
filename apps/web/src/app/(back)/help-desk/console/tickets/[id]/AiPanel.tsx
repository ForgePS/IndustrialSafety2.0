'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbSparkles } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import { aiSuggestionLabels, label, priorityLabels } from '@/lib/forgeHelpdesk'
import type { ActionResult } from '@/components/helpdesk/useActionRunner'
import { applyTicketChangeAction, decideSuggestionAction, generateSuggestionAction } from '../../actions'
import type { WorkspaceProps } from './TicketWorkspace'

type Props = WorkspaceProps & {
  run: (fn: () => Promise<ActionResult>, success?: string, after?: (r: ActionResult) => void) => void
  pending: boolean
  onUse: (text: string, suggestionId: string, mode: 'reply' | 'note') => void
}

const AiPanel = ({ detail, permissions, run, pending, onUse }: Props) => {
  const router = useRouter()
  const { ticket } = detail
  const can = (key: string) => permissions.includes(key)
  const [type, setType] = useState('summarize')
  const [showDecided, setShowDecided] = useState(false)
  const open = detail.suggestions.filter((s: any) => s.status === 'generated')
  const decided = detail.suggestions.filter((s: any) => s.status !== 'generated')

  const decide = (s: any, decision: 'accepted' | 'rejected', finalOutput?: string) => decideSuggestionAction({ ticketId: ticket.id, suggestionId: s.id, decision, finalOutput })

  const applyAndAccept = (s: any, changes: Record<string, string>, success: string) =>
    run(async () => {
      const result = await applyTicketChangeAction({ ticketId: ticket.id, expectedRowVersion: ticket.row_version, changes, reason: `Applied AI suggestion (${label(aiSuggestionLabels, s.suggestion_type)})` })

      if (!result.ok) return result

      return decide(s, 'accepted', JSON.stringify(changes))
    }, success)

  const actionsFor = (s: any) => {
    const data = s.output || {}

    switch (s.suggestion_type) {
      case 'suggest_response':
        return can('helpdesk.support.respond') ? (
          <Button type='button' size='xs' onClick={() => onUse(s.output_text, s.id, 'reply')}>
            Use in reply
          </Button>
        ) : null
      case 'summarize':
      case 'troubleshooting':
      case 'likely_cause':
      case 'knowledge_search':
      case 'similar_tickets':
        return can('helpdesk.support.internal_note') ? (
          <Button type='button' size='xs' variant='outline' onClick={() => onUse(s.output_text, s.id, 'note')}>
            Use in internal note
          </Button>
        ) : null
      case 'suggest_priority':
        return data.priority && data.priority !== ticket.priority && can('helpdesk.support.change_priority') ? (
          <Button type='button' size='xs' disabled={pending} onClick={() => applyAndAccept(s, { priority: data.priority }, 'Priority updated from AI suggestion.')}>
            Set {label(priorityLabels, data.priority)}
          </Button>
        ) : null
      case 'suggest_category':
      case 'suggest_module':
        return can('helpdesk.support.change_status')
          ? (data.options || []).slice(0, 3).map((o: any) => (
              <Button
                key={o.id}
                type='button'
                size='xs'
                variant='outline'
                disabled={pending}
                onClick={() => applyAndAccept(s, { [s.suggestion_type === 'suggest_category' ? 'category_id' : 'module_id']: o.id }, `${o.label} applied.`)}
              >
                {o.label}
              </Button>
            ))
          : null
      case 'suggest_assignee':
        return can('helpdesk.support.assign')
          ? (data.candidates || []).map((c: any) => (
              <Button key={c.id} type='button' size='xs' variant='outline' disabled={pending} onClick={() => applyAndAccept(s, { assigned_user_id: c.id }, `Assigned to ${c.name}.`)}>
                Assign {c.name}
              </Button>
            ))
          : null
      case 'duplicate_detection':
        return (data.tickets || []).slice(0, 3).map((t: any) => (
          <Button key={t.id} asChild size='xs' variant='outline'>
            <Link href={`/help-desk/console/tickets/${t.id}`}>{t.ticket_number}</Link>
          </Button>
        ))
      case 'platform_incident':
        return can('helpdesk.admin.incidents') ? (
          <Button asChild size='xs' variant='outline'>
            <Link href={`/help-desk/console/incidents?declare=1&ticket=${ticket.id}`}>Declare incident</Link>
          </Button>
        ) : null
      case 'knowledge_draft':
        return can('helpdesk.knowledge.create') ? (
          <Button
            type='button'
            size='xs'
            disabled={pending}
            onClick={() =>
              run(
                () => decide(s, 'accepted'),
                'Draft accepted. Opening the article editor.',
                () => router.push(`/help-desk/console/knowledge/new?suggestion=${s.id}`)
              )
            }
          >
            Create article draft
          </Button>
        ) : null
      default:
        return null
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <TbSparkles />
          AI assist
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='text-textSecondary text-xs'>Suggestions are drafts for staff review. Nothing is sent or changed until you choose an action.</p>
        <div className='flex gap-2'>
          <select value={type} onChange={e => setType(e.target.value)} aria-label='Suggestion type' className='border-input bg-card h-[32px] min-w-0 flex-1 rounded-md border px-2 text-sm'>
            {Object.entries(aiSuggestionLabels).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
          <Button type='button' size='sm' disabled={pending} onClick={() => run(() => generateSuggestionAction({ ticketId: ticket.id, type }), 'Suggestion ready for review.')}>
            Generate
          </Button>
        </div>

        {open.map((s: any) => (
          <div key={s.id} className='flex flex-col gap-2 rounded-md border p-3'>
            <div className='flex items-center justify-between gap-2 text-xs'>
              <span className='font-semibold'>{label(aiSuggestionLabels, s.suggestion_type)}</span>
              <span className='text-textSecondary'>{s.provider}</span>
            </div>
            <p className='max-h-48 overflow-y-auto whitespace-pre-wrap text-sm'>{s.output_text}</p>
            <div className='flex flex-wrap gap-1'>
              {actionsFor(s)}
              <Button type='button' size='xs' variant='ghost' disabled={pending} onClick={() => run(() => decide(s, 'rejected'), 'Suggestion dismissed.')}>
                Reject
              </Button>
            </div>
          </div>
        ))}

        {decided.length ? (
          <div>
            <button type='button' className='text-primary text-xs underline' onClick={() => setShowDecided(v => !v)}>
              {showDecided ? 'Hide' : 'Show'} {decided.length} reviewed suggestion(s)
            </button>
            {showDecided ? (
              <ul className='mt-2 flex flex-col gap-1 text-xs'>
                {decided.map((s: any) => (
                  <li key={s.id} className='text-textSecondary'>
                    {label(aiSuggestionLabels, s.suggestion_type)} — {s.status} by {s.decided_by_name || 'staff'}
                    {s.used_in_message_id ? ' · used in a message' : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default AiPanel
