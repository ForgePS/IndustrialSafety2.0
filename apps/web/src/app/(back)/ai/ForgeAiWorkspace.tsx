'use client'

import { FormEvent, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  TbArrowUp,
  TbBrain,
  TbMessageCirclePlus,
  TbShieldCheck,
  TbSparkles
} from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'

type Conversation = {
  id: string
  title: string
  last_message_at: string
  pinned: boolean
}

type Message = {
  id: string | number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const ForgeAiWorkspace = ({
  assistantName,
  organizationName,
  conversations,
  activeConversationId,
  initialMessages,
  quickPrompts
}: {
  assistantName: string
  organizationName: string
  conversations: Conversation[]
  activeConversationId: string | null
  initialMessages: Message[]
  quickPrompts: string[]
}) => {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | null>(activeConversationId)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const hasConversation = messages.length > 0

  const orderedConversations = useMemo(
    () => [...conversations].sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at)),
    [conversations]
  )

  const send = async (messageOverride?: string) => {
    const text = (messageOverride ?? input).trim()
    if (!text || pending) return

    const requestId = ++requestIdRef.current
    const optimistic: Message = {
      id: 'local-' + String(requestId),
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    }

    setMessages(current => [...current, optimistic])
    setInput('')
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/forge-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text
        })
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || 'Forge AI could not complete this request.')
      }

      if (payload.conversationId && !conversationId) {
        setConversationId(payload.conversationId)
        window.history.replaceState(null, '', '/ai?conversation=' + payload.conversationId)
      }

      setMessages(current => [
        ...current,
        {
          id: payload.message.id,
          role: 'assistant',
          content: payload.message.content,
          created_at: payload.message.created_at
        }
      ])

      router.refresh()
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
    <div className='grid min-h-[calc(100vh-9rem)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)]'>
      <Card className='overflow-hidden'>
        <CardContent className='flex h-full flex-col p-0'>
          <div className='border-b p-4'>
            <Button className='w-full' asChild>
              <Link href='/ai'>
                <TbMessageCirclePlus />
                New Conversation
              </Link>
            </Button>
          </div>

          <div className='flex-1 overflow-y-auto p-3'>
            <div className='text-textSecondary px-2 pb-2 text-xs font-semibold uppercase tracking-wide'>Recent</div>
            <div className='flex flex-col gap-1'>
              {orderedConversations.length ? orderedConversations.map(conversation => (
                <Link
                  key={conversation.id}
                  href={'/ai?conversation=' + conversation.id}
                  className={
                    'rounded-lg px-3 py-3 text-sm transition ' +
                    (conversation.id === conversationId ? 'bg-primary/10 text-primary' : 'hover:bg-neutral/5')
                  }
                >
                  <div className='truncate font-medium'>{conversation.title}</div>
                  <div className='text-textSecondary mt-1 text-xs'>{new Date(conversation.last_message_at).toLocaleString()}</div>
                </Link>
              )) : (
                <div className='text-textSecondary px-3 py-6 text-center text-sm'>No conversations yet.</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className='overflow-hidden'>
        <CardContent className='flex h-full min-h-[720px] flex-col p-0'>
          <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4'>
            <div className='flex items-center gap-3'>
              <div className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg'>
                <TbBrain className='size-5' />
              </div>
              <div>
                <div className='text-textPrimary font-semibold'>{assistantName}</div>
                <div className='text-textSecondary text-xs'>{organizationName}</div>
              </div>
            </div>
            <Badge variant='outline' size='sm'><TbShieldCheck />Permission-aware</Badge>
          </div>

          <div className='flex-1 overflow-y-auto px-5 py-6'>
            {!hasConversation ? (
              <div className='mx-auto flex max-w-3xl flex-col items-center py-12 text-center'>
                <div className='bg-primary/10 text-primary flex size-16 items-center justify-center rounded-2xl'>
                  <TbSparkles className='size-8' />
                </div>
                <h1 className='text-textPrimary mt-5 text-3xl font-bold'>{assistantName}</h1>
                <p className='text-textSecondary mt-3 max-w-2xl'>
                  Ask about Forge records, trends, overdue work, incidents, inspections, training, assets, or your access. The assistant can only retrieve data your current account is authorized to see.
                </p>

                <div className='mt-8 grid w-full gap-3 md:grid-cols-2'>
                  {quickPrompts.map(prompt => (
                    <button
                      key={prompt}
                      type='button'
                      onClick={() => void send(prompt)}
                      className='rounded-xl border p-4 text-left text-sm transition hover:border-primary/50 hover:bg-primary/5'
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className='mx-auto flex max-w-4xl flex-col gap-5'>
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={
                        'max-w-[88%] rounded-2xl px-4 py-3 ' +
                        (message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'border bg-card')
                      }
                    >
                      <div className='whitespace-pre-wrap text-sm leading-6'>{message.content}</div>
                      <div className={'mt-2 text-[11px] ' + (message.role === 'user' ? 'opacity-70' : 'text-textSecondary')}>
                        {message.role === 'user' ? 'You' : assistantName} · {new Date(message.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                {pending ? (
                  <div className='flex justify-start'>
                    <div className='rounded-2xl border bg-card px-4 py-3 text-sm'>
                      <div className='flex items-center gap-2'>
                        <TbSparkles className='text-primary animate-pulse' />
                        {assistantName} is checking Forge...
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
            <form onSubmit={submit} className='mx-auto max-w-4xl'>
              <div className='rounded-2xl border bg-card p-3 shadow-sm'>
                <Textarea
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  placeholder={'Ask ' + assistantName + ' about Forge Safety...'}
                  rows={3}
                  disabled={pending}
                  className='min-h-[82px] resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0'
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (input.trim() && !pending) void send()
                    }
                  }}
                />
                <div className='mt-2 flex items-center justify-between gap-3'>
                  <div className='text-textSecondary text-xs'>
                    AI output should be reviewed before safety-critical, regulatory, or personnel decisions.
                  </div>
                  <Button type='submit' size='sm' disabled={pending || !input.trim()}>
                    <TbArrowUp />
                    Send
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default ForgeAiWorkspace
