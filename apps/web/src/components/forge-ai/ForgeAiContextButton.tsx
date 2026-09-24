'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { TbArrowUp, TbBook2, TbSparkles } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@repo/ui/components/ui/sheet'
import { Textarea } from '@repo/ui/components/ui/textarea'

type ContextType = 'incident' | 'inspection' | 'asset'

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
  source_refs?: SourceRef[]
  prepared_actions?: PreparedAction[]
}

const promptsByType: Record<ContextType, string[]> = {
  incident: [
    'Summarize this incident and the current workflow status.',
    'What details or follow-up items appear to need attention?',
    'Give me investigation questions to consider based on this record.',
    'Search our Forge Knowledge for policies or SOPs relevant to this incident.'
  ],
  inspection: [
    'Summarize this inspection, failed items, and open findings.',
    'Which corrective actions should be prioritized for review?',
    'What follow-up questions should I ask before closing this inspection?',
    'Search our Forge Knowledge for policies or SOPs relevant to these findings.'
  ],
  asset: [
    'Summarize this asset, condition, maintenance history, and current concerns.',
    'What maintenance or reliability issues stand out in this record?',
    'What follow-up should I consider based on this asset history?',
    'Search our Forge Knowledge for procedures or manuals relevant to this equipment.'
  ]
}

const ForgeAiContextButton = ({
  contextType,
  recordId,
  recordLabel
}: {
  contextType: ContextType
  recordId: string
  recordLabel: string
}) => {
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prompts = useMemo(() => promptsByType[contextType], [contextType])

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || pending) return

    const localId = 'local-' + String(Date.now())
    setMessages(current => [...current, { id: localId, role: 'user', content: text }])
    setInput('')
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/forge-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
          context: {
            type: contextType,
            id: recordId
          }
        })
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || 'Forge AI could not complete this request.')
      }

      if (!conversationId && payload.conversationId) {
        setConversationId(payload.conversationId)
      }

      setMessages(current => [
        ...current,
        {
          id: payload.message.id,
          role: 'assistant',
          content: payload.message.content,
          source_refs: payload.message.source_refs || [],
          prepared_actions: payload.message.prepared_actions || []
        }
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Forge AI request failed.'
      )
    } finally {
      setPending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant='outline'>
          <TbSparkles />
          Ask Forge
        </Button>
      </SheetTrigger>

      <SheetContent side='right' className='max-is-[620px] p-0'>
        <div className='flex h-full flex-col'>
          <SheetHeader className='border-b p-5 text-left'>
            <SheetTitle>Ask Forge</SheetTitle>
            <SheetDescription>
              Context: {recordLabel}. Forge re-checks your permissions before loading this record.
            </SheetDescription>
          </SheetHeader>

          <div className='flex-1 overflow-y-auto p-5'>
            {!messages.length ? (
              <div>
                <div className='text-textPrimary text-lg font-semibold'>What do you want to know?</div>
                <div className='text-textSecondary mt-2 text-sm'>
                  Forge AI can use this record, your allowed Forge data, and approved tenant knowledge.
                </div>

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
              <div className='flex flex-col gap-4'>
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={
                        'max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ' +
                        (message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-card')
                      }
                    >
                      <div className='whitespace-pre-wrap'>{message.content}</div>

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
                                  {[
                                    source.section_title,
                                    source.page_number ? 'Page ' + String(source.page_number) : null,
                                    source.source_reference
                                  ].filter(Boolean).join(' · ') || 'Tenant knowledge source'}
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
                              {action.risk_summary ? (
                                <div className='text-textSecondary mt-2 text-xs'>{action.risk_summary}</div>
                              ) : null}
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
                        Forge AI is checking this record...
                      </div>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
                    {error}
                  </div>
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
                  placeholder='Ask about this record...'
                  className='resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0'
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (input.trim() && !pending) void send()
                    }
                  }}
                />
                <div className='mt-2 flex items-center justify-between gap-3'>
                  <div className='text-textSecondary text-xs'>
                    Review AI output before safety-critical or regulatory decisions.
                  </div>
                  <Button type='submit' size='sm' disabled={pending || !input.trim()}>
                    <TbArrowUp />
                    Send
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ForgeAiContextButton
