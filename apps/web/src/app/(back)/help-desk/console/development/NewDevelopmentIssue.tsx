'use client'

import { useState } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { developmentTypeLabels, HELPDESK_PRIORITIES, label, priorityLabels } from '@/lib/forgeHelpdesk'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { createDevelopmentIssueAction } from '../actions'

const selectClass = 'border-input bg-card h-[38px] rounded-md border px-3 text-sm'

const NewDevelopmentIssue = ({ providers }: { providers: { key: string; label: string }[] }) => {
  const router = useRouter()
  const { pending, notice, run } = useActionRunner()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', issueType: 'bug', priority: 'p3_normal', description: '', customerImpact: '', reproductionSteps: '', knownIssueReference: '' })
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))

  return (
    <>
      <Button type='button' onClick={() => setOpen(true)}>
        New development issue
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-xl'>
          <DialogHeader>
            <DialogTitle>New development issue</DialogTitle>
          </DialogHeader>
          <div className='flex flex-col gap-3'>
            <Input aria-label='Title' maxLength={200} value={form.title} onChange={e => set({ title: e.target.value })} placeholder='Title' />
            <div className='grid grid-cols-2 gap-2'>
              <select aria-label='Type' value={form.issueType} onChange={e => set({ issueType: e.target.value })} className={selectClass}>
                {Object.entries(developmentTypeLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select aria-label='Priority' value={form.priority} onChange={e => set({ priority: e.target.value })} className={selectClass}>
                {HELPDESK_PRIORITIES.map(p => (
                  <option key={p} value={p}>
                    {label(priorityLabels, p)}
                  </option>
                ))}
              </select>
            </div>
            <Textarea aria-label='Description' rows={4} maxLength={20000} value={form.description} onChange={e => set({ description: e.target.value })} placeholder='Description' />
            <Textarea aria-label='Customer impact' rows={2} maxLength={4000} value={form.customerImpact} onChange={e => set({ customerImpact: e.target.value })} placeholder='Customer impact' />
            <Textarea aria-label='Reproduction steps' rows={3} maxLength={8000} value={form.reproductionSteps} onChange={e => set({ reproductionSteps: e.target.value })} placeholder='Steps to reproduce' />
            <Input aria-label='Known issue reference' maxLength={300} value={form.knownIssueReference} onChange={e => set({ knownIssueReference: e.target.value })} placeholder='Known-issue article or reference (optional)' />
            {providers.length ? <p className='text-textSecondary text-xs'>To push to {providers.map(p => p.label).join(', ')}, create the issue from a ticket so a sanitized payload can be built.</p> : null}
            {notice ? (
              <p role='alert' className='text-destructive text-sm'>
                {notice.text}
              </p>
            ) : null}
            <div className='flex justify-end gap-2'>
              <Button type='button' variant='ghost' onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type='button'
                disabled={pending || form.title.trim().length < 4 || form.description.trim().length < 4}
                onClick={() =>
                  run(() => createDevelopmentIssueAction({ ...form, ticketId: null, pushToProvider: null }), 'Development issue created.', result => {
                    setOpen(false)
                    router.push(`/help-desk/console/development/${result.development_issue_id}`)
                  })
                }
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default NewDevelopmentIssue
