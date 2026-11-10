'use client'

import { useState, type FormEvent } from 'react'

import Link from 'next/link'
import { TbArrowUp, TbBook2, TbShieldCheck, TbSparkles } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Textarea } from '@repo/ui/components/ui/textarea'

import type { ForgeAiSource } from '@/lib/forgeAiResponseCheck'

export type ForgeAiRecordContextType = 'incident' | 'inspection' | 'asset' | 'personnel' | 'training_course' | 'qr' | 'loto' | 'task'

type SourceRef = {
  source_title?: string | null
  source_reference?: string | null
  section_title?: string | null
  page_number?: number | null
}

type PreparedAction = {
  approval_id: string
  action_name: string
  target_reference?: string | null
  risk_summary?: string | null
  expires_at?: string | null
}

type Message = {
  id: string | number
  role: 'user' | 'assistant'
  content: string
  agent?: { key: string; name: string } | null
  sources?: ForgeAiSource[]
  source_refs?: SourceRef[]
  prepared_actions?: PreparedAction[]
}

// Detail pages for records an answer cites.
const RECORD_ROUTES: Record<string, string> = {
  incident: '/incidents/',
  inspection: '/inspections/',
  asset: '/assets/',
  corrective_action: '/corrective-actions/',
  risk: '/risk-register/',
  jsa: '/jsas/',
  loto: '/loto/',
  task: '/tasks/',
  personnel: '/personnel/',
  training_course: '/training/courses/',
  observation: '/observations/'
}

// The chat body shared by the record "Ask Forge" sheet and the global assistant. With a record
// context, the server re-checks the user's access to that record before using it.
const ForgeAiAssistantPanel = ({
  context,
  prompts,
  intro,
  placeholder
}: {
  context: { type: ForgeAiRecordContextType; id: string } | null
  prompts: string[]
  intro: string
  placeholder: string
}) => {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (override?: string) => {
    const text = (override ?? input).trim()

    if (!text || pending) return

    setMessages(current => [...current, { id: 'local-' + String(Date.now()), role: 'user', content: text }])
    setInput('')
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/forge-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text, context })
      })

      const payload = await response.json()

      if (!response.ok) throw new Error(payload?.error || 'Forge AI could not complete this request.')

      if (!conversationId && payload.conversationId) setConversationId(payload.conversationId)

      setMessages(current => [
        ...current,
        {
          id: payload.message.id,
          role: 'assistant',
          content: payload.message.content,
          agent: payload.message.agent || null,
          sources: payload.message.sources || [],
          source_refs: payload.message.source_refs || [],
          prepared_actions: payload.message.prepared_actions || []
        }
      ])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Forge AI request failed.')
    } finally {
      setPending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  return (
    <div className='flex min-bs-0 flex-1 flex-col'>
      <div className='flex-1 overflow-y-auto p-5'>
        {!messages.length ? (
          <div>
            <div className='text-textPrimary text-lg font-semibold'>What do you want to know?</div>
            <div className='text-textSecondary mt-2 text-sm'>{intro}</div>

            <div className='mt-5 flex flex-col gap-2'>
              {prompts.map(prompt => (
                <button
                  key={prompt}
                  type='button'
                  onClick={() => void send(prompt)}
                  className='rounded-lg border p-3 text-left text-sm transition hover:border-primary/50 hover:bg-primary/5'
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className='flex flex-col gap-4' data-testid='assistant-messages'>
            {messages.map(message => (
              <div key={message.id} className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={
                    'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ' +
                    (message.role === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-card')
                  }
                  data-testid={message.role === 'assistant' ? 'assistant-message' : undefined}
                >
                  {message.role === 'assistant' && message.agent && message.agent.key !== 'general' ? (
                    <Badge size='sm' variant='tonalPrimary' className='mb-2'>
                      {message.agent.name}
                    </Badge>
                  ) : null}

                  <div className='whitespace-pre-wrap'>{message.content}</div>

                  {message.role === 'assistant' && message.sources?.some(source => source.kind === 'record') ? (
                    <div className='mt-3 border-t pt-3'>
                      <div className='text-textSecondary flex items-center gap-2 text-xs font-semibold uppercase tracking-wide'>
                        <TbShieldCheck />
                        Forge Records Cited
                      </div>
                      <div className='mt-2 flex flex-wrap gap-2'>
                        {message.sources.map(source =>
                          source.kind === 'record' ? (
                            source.id && RECORD_ROUTES[source.recordType] ? (
                              <Link
                                key={source.reference}
                                href={RECORD_ROUTES[source.recordType] + source.id}
                                className='rounded-md border px-2 py-1 text-xs font-medium hover:bg-primary/5'
                              >
                                {source.reference}
                              </Link>
                            ) : (
                              <span key={source.reference} className='rounded-md border px-2 py-1 text-xs'>
                                {source.reference}
                              </span>
                            )
                          ) : null
                        )}
                      </div>
                    </div>
                  ) : null}

                  {message.role === 'assistant' && message.source_refs?.length ? (
                    <div className='mt-3 border-t pt-3'>
                      <div className='text-textSecondary flex items-center gap-2 text-xs font-semibold uppercase tracking-wide'>
                        <TbBook2 />
                        Forge Knowledge Sources
                      </div>
                      <div className='mt-2 flex flex-col gap-2'>
                        {message.source_refs.map((source, index) => (
                          <div key={index} className='rounded-lg border px-3 py-2 text-xs'>
                            <div className='font-semibold'>{source.source_title || 'Forge Knowledge'}</div>
                            <div className='text-textSecondary mt-1'>
                              {[source.section_title, source.page_number ? 'Page ' + String(source.page_number) : null, source.source_reference]
                                .filter(Boolean)
                                .join(' · ') || 'Tenant knowledge source'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {message.role === 'assistant' && message.prepared_actions?.length ? (
                    <div className='mt-3 border-t pt-3'>
                      {message.prepared_actions.map(action => (
                        <div key={action.approval_id} className='rounded-lg border border-primary/30 bg-primary/5 p-3'>
                          <div className='font-semibold'>Action prepared — approval required</div>
                          <div className='text-textSecondary mt-1 text-xs'>
                            {action.action_name}
                            {action.target_reference ? ' · ' + action.target_reference : ''}
                          </div>
                          {action.risk_summary ? <div className='text-textSecondary mt-2 text-xs'>{action.risk_summary}</div> : null}
                          <Button className='mt-3' size='sm' variant='outline' asChild>
                            <Link href='/ai/actions'>Review AI Action</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {pending ? (
              <div className='flex justify-start'>
                <div className='rounded-2xl border bg-card px-4 py-3 text-sm'>
                  <div className='flex items-center gap-2'>
                    <TbSparkles className='text-primary animate-pulse' />
                    {context ? 'Forge AI is checking this record...' : 'Forge AI is working...'}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>{error}</div>
            ) : null}
          </div>
        )}
      </div>

      <div className='border-t p-4'>
        <form onSubmit={submit}>
          <div className='rounded-xl border bg-card p-3'>
            <Textarea
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={3}
              disabled={pending}
              placeholder={placeholder}
              aria-label='Message Forge AI'
              className='resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0'
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (input.trim() && !pending) void send()
                }
              }}
            />
            <div className='mt-2 flex items-center justify-between gap-3'>
              <div className='text-textSecondary text-xs'>Review AI output before safety-critical or regulatory decisions.</div>
              <Button type='submit' size='sm' disabled={pending || !input.trim()}>
                <TbArrowUp />
                Send
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ForgeAiAssistantPanel
