'use client'

import { useState } from 'react'

import { TbSparkles } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@repo/ui/components/ui/sheet'

import ForgeAiAssistantPanel from './ForgeAiAssistantPanel'
import type { ForgeAiRecordContextType } from './ForgeAiAssistantPanel'

type ContextType = ForgeAiRecordContextType

export const promptsByType: Record<ContextType, string[]> = {
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
  ],
  personnel: [
    'Summarize this personnel profile using only information I am allowed to view.',
    'What training or qualification follow-up should I consider for this person?',
    'What current Forge records about this person need attention?',
    'Explain this person\'s visible status, Location, and Division context.'
  ],
  training_course: [
    'Summarize this training course and its current usage.',
    'What should be improved or clarified in this course description?',
    'What company policies or SOPs are relevant to this training course?',
    'Help me build a practical refresher outline for this course.'
  ],
  qr: [
    'Summarize this managed QR code and what it currently opens.',
    'Does anything about this QR configuration need attention?',
    'Explain the linked asset context for this QR code.',
    'Help me plan how this QR should be used in the field.'
  ],
  loto: [
    'Summarize this LOTO procedure, hazardous energy sources, and current approval status.',
    'Review this procedure for missing or unclear energy-control information that a qualified reviewer should verify.',
    'What parts of this procedure deserve the most attention during periodic review?',
    'Search our Forge Knowledge for policies, SOPs, or equipment guidance relevant to this LOTO procedure.'
  ],
  task: [
    'Summarize this Task, current status, due date, and recent activity.',
    'What information or follow-up appears necessary before this Task can be closed?',
    'Is this Task overdue or blocked, and what should I review next?',
    'Search our Forge Knowledge for policies or procedures relevant to this Task.'
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
            <SheetDescription>Context: {recordLabel}. Forge re-checks your permissions before loading this record.</SheetDescription>
          </SheetHeader>

          <ForgeAiAssistantPanel
            context={{ type: contextType, id: recordId }}
            prompts={promptsByType[contextType]}
            intro='Forge AI can use this record, your allowed Forge data, and approved tenant knowledge.'
            placeholder='Ask about this record...'
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default ForgeAiContextButton
