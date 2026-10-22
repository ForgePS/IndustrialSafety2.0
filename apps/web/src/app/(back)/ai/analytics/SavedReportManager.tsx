'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { TbPin, TbPinned, TbPlus, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  createForgeAiSavedReport,
  deleteForgeAiSavedReport,
  setForgeAiSavedReportPinned
} from './actions'

type SavedReport = {
  id: string
  name: string
  description: string | null
  prompt: string
  report_type: string
  visibility: string
  pinned: boolean
  default_date_range_days: number | null
  owner_user_id: string
}

const SavedReportManager = ({
  reports,
  currentUserId
}: {
  reports: SavedReport[]
  currentUserId: string
}) => {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [reportType, setReportType] = useState<'ai_analysis'|'executive_summary'|'incident'|'training'|'inspection'|'asset'>('ai_analysis')
  const [visibility, setVisibility] = useState<'private'|'tenant'>('private')
  const [days, setDays] = useState('90')

  const save = () => {
    startTransition(async () => {
      const result = await createForgeAiSavedReport({
        name,
        description,
        prompt,
        reportType,
        visibility,
        defaultDateRangeDays: days ? Number(days) : null,
        pinned: false
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save report.')
        return
      }

      toast('success', result.message)
      setName('')
      setDescription('')
      setPrompt('')
      setOpen(false)
      window.location.reload()
    })
  }

  const pin = (report: SavedReport) => {
    startTransition(async () => {
      const result = await setForgeAiSavedReportPinned({
        reportId: report.id,
        pinned: !report.pinned
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to update report.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const remove = (report: SavedReport) => {
    if (!window.confirm('Delete "' + report.name + '"?')) return

    startTransition(async () => {
      const result = await deleteForgeAiSavedReport(report.id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to delete report.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <CardTitle>Saved AI Reports</CardTitle>
            <CardDescription>Reusable natural-language analysis prompts for Forge AI.</CardDescription>
          </div>
          <Button size='sm' onClick={() => setOpen(value => !value)}>
            <TbPlus />
            {open ? 'Close' : 'Save Report'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {open ? (
          <div className='grid gap-4 rounded-xl border p-4 md:grid-cols-2'>
            <div>
              <Label>Name</Label>
              <Input className='mt-2' value={name} onChange={event => setName(event.target.value)} placeholder='Monthly Executive Safety Review' />
            </div>
            <div>
              <Label>Report Type</Label>
              <select
                value={reportType}
                onChange={event => setReportType(event.target.value as any)}
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              >
                <option value='ai_analysis'>General AI Analysis</option>
                <option value='executive_summary'>Executive Summary</option>
                <option value='incident'>Incident Analysis</option>
                <option value='training'>Training Analysis</option>
                <option value='inspection'>Inspection Analysis</option>
                <option value='asset'>Asset Analysis</option>
              </select>
            </div>
            <div>
              <Label>Visibility</Label>
              <select
                value={visibility}
                onChange={event => setVisibility(event.target.value as 'private'|'tenant')}
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              >
                <option value='private'>Private</option>
                <option value='tenant'>Tenant Shared</option>
              </select>
            </div>
            <div>
              <Label>Default Date Range (Days)</Label>
              <Input className='mt-2' type='number' min='1' max='3650' value={days} onChange={event => setDays(event.target.value)} />
            </div>
            <div className='md:col-span-2'>
              <Label>Description</Label>
              <Input className='mt-2' value={description} onChange={event => setDescription(event.target.value)} placeholder='Optional description...' />
            </div>
            <div className='md:col-span-2'>
              <Label>Prompt</Label>
              <Textarea className='mt-2' rows={4} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder='Build an executive safety summary for the last 90 days. Highlight meaningful changes, overdue work, critical findings, and equipment issues.' />
            </div>
            <div className='md:col-span-2'>
              <Button onClick={save} disabled={pending || !name.trim() || !prompt.trim()}>Save Report</Button>
            </div>
          </div>
        ) : null}

        {reports.length ? (
          <div className='grid gap-3 lg:grid-cols-2'>
            {reports.map(report => {
              const owner = report.owner_user_id === currentUserId
              const prompt = report.default_date_range_days
                ? report.prompt + '\n\nUse the last ' + String(report.default_date_range_days) + ' days unless I specify another range.'
                : report.prompt

              return (
                <div key={report.id} className='rounded-xl border p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <div className='flex items-center gap-2 font-semibold'>
                        {report.pinned ? <TbPinned /> : null}
                        {report.name}
                      </div>
                      {report.description ? <p className='text-textSecondary mt-1 text-sm'>{report.description}</p> : null}
                      <div className='text-textSecondary mt-2 text-xs'>
                        {report.report_type.replaceAll('_', ' ')} · {report.visibility}
                        {report.default_date_range_days ? ' · ' + report.default_date_range_days + ' days' : ''}
                      </div>
                    </div>
                    {owner ? (
                      <div className='flex gap-1'>
                        <Button size='icon' variant='ghost' onClick={() => pin(report)} disabled={pending} title={report.pinned ? 'Unpin' : 'Pin'}>
                          {report.pinned ? <TbPinned /> : <TbPin />}
                        </Button>
                        <Button size='icon' variant='ghost' onClick={() => remove(report)} disabled={pending} title='Delete'>
                          <TbTrash />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  <div className='mt-4'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/ai?prompt=' + encodeURIComponent(prompt)}>Run with Forge AI</Link>
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className='text-textSecondary rounded-xl border p-6 text-center text-sm'>No saved AI reports yet.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default SavedReportManager
