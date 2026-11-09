'use client'

import { useEffect, useState } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { TbSparkles } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@repo/ui/components/ui/sheet'

import ForgeAiAssistantPanel from './ForgeAiAssistantPanel'
import { promptsByType } from './ForgeAiContextButton'
import { promptsForPath, recordContextForPath } from '@/lib/forgeAiPageContext'

// The header assistant, available on every page to users who can use Forge AI. On a record page
// it uses that record as context; elsewhere it answers from the user's own Forge data.
// Ctrl+J (Cmd+J on a Mac) opens it.
const ForgeAiGlobalAssistant = ({ assistantName, commandCenter }: { assistantName: string; commandCenter: boolean }) => {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const record = recordContextForPath(pathname)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setOpen(current => !current)
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The full workspace already is the assistant.
  if (pathname === '/ai') return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant='ghost' size='sm' onClick={() => setOpen(true)} aria-label={'Open ' + assistantName} aria-keyshortcuts='Control+J'>
        <TbSparkles className='text-primary' />
        <span className='hidden sm:inline'>{assistantName}</span>
      </Button>

      <SheetContent side='right' className='max-is-[620px] p-0' data-testid='global-assistant'>
        <div className='flex h-full flex-col'>
          <SheetHeader className='border-b p-5 text-left'>
            <SheetTitle>{assistantName}</SheetTitle>
            <SheetDescription>
              {record
                ? `Context: ${record.label}. Forge re-checks your permissions before loading it.`
                : 'Answers from the Forge records and knowledge you are allowed to see.'}{' '}
              <Link href={commandCenter ? '/ai/command-center' : '/ai'} className='text-primary font-medium' onClick={() => setOpen(false)}>
                {commandCenter ? 'Open Command Center' : 'Open full workspace'}
              </Link>
            </SheetDescription>
          </SheetHeader>

          <ForgeAiAssistantPanel
            key={record ? record.type + ':' + record.id : 'page'}
            context={record ? { type: record.type, id: record.id } : null}
            prompts={record ? promptsByType[record.type] : promptsForPath(pathname)}
            intro={
              record
                ? `${assistantName} can use ${record.label}, your allowed Forge data, and approved tenant knowledge.`
                : `${assistantName} can search your allowed Forge data and approved tenant knowledge.`
            }
            placeholder={record ? 'Ask about ' + record.label + '...' : 'Ask Forge AI...'}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ForgeAiGlobalAssistant
