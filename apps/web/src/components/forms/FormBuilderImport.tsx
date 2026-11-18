'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArrowLeft, TbFileImport } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import { importChecklistCsv } from '@/app/(back)/forms/templateActions'
import type { ChecklistImport } from '@/lib/forgeFormBuilderRules'
import { parseTemplateCsv, titleFromFilename } from '@/lib/forgeFormBuilderRules'
import { FORM_FIELD_TYPE_LABELS } from '@/lib/forgeFormRules'

/**
 * Port slice 9 (piece A): checklist import (1.0 form-checklist-import). A CSV becomes a new template draft that
 * opens in the builder. Excel is not supported (no spreadsheet parser in apps/web): save the sheet as CSV.
 */

const labelClass = 'text-textSecondary text-xs font-medium'

const MODE_LABELS: Record<ChecklistImport['mode'], string> = {
  structured: 'Field sheet (label, type, required, options)',
  checklist: 'Checklist: each question becomes a Yes / No / N/A item with notes',
  outline: 'Checklist with sections in column A and questions in column B'
}

const FormBuilderImport = ({ categories }: { categories: string[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [preview, setPreview] = useState<ChecklistImport | null>(null)
  const [error, setError] = useState('')

  const onFile = async (selected: File | undefined) => {
    setPreview(null)
    setError('')
    setFile(null)

    if (!selected) return

    if (!/\.csv$/i.test(selected.name)) {
      setError('Upload a .csv file. For an Excel workbook, save the sheet as CSV first.')

      return
    }

    const text = await selected.text()

    setFile({ name: selected.name, text })

    try {
      const parsed = parseTemplateCsv(text, titleFromFilename(selected.name))

      setPreview(parsed)
      setTitle(parsed.title)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not read the CSV.')
    }
  }

  const submit = () =>
    startTransition(async () => {
      if (!file) return

      const result = await importChecklistCsv({ filename: file.name, text: file.text, title, category })

      if (!result.ok) {
        setError(result.error)
        toast('error', result.error)

        return
      }

      toast('success', result.message)
      router.push(`/forms/templates/${result.id}`)
    })

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/forms?view=manage' className='text-textSecondary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Manage templates
        </Link>
        <h1 className='text-textPrimary mt-2 flex items-center gap-3 text-3xl font-bold'>
          <TbFileImport />
          Import checklist
        </h1>
        <p className='text-textSecondary mt-2'>
          Upload a CSV to start a new form draft. A column of questions (with an optional Question, Section and Title header) becomes required Yes /
          No / N/A items with notes. A sheet with label and type columns (plus required, options, help) becomes those fields. Excel files: save
          the sheet as CSV first.
        </p>
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-3'>
          <label className='flex flex-col gap-1'>
            <span className={labelClass}>CSV file</span>
            <input type='file' accept='.csv,text/csv' aria-label='CSV file' onChange={event => onFile(event.target.files?.[0])} className='text-sm' />
          </label>
          <label className='flex flex-col gap-1'>
            <span className={labelClass}>Form title</span>
            <Input name='title' value={title} maxLength={200} onChange={event => setTitle(event.target.value)} />
          </label>
          <label className='flex flex-col gap-1'>
            <span className={labelClass}>Category (optional)</span>
            <Input name='category' list='form-import-categories' value={category} maxLength={100} onChange={event => setCategory(event.target.value)} />
            <datalist id='form-import-categories'>
              {categories.map(item => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
        </CardContent>
      </Card>

      {error ? (
        <div className='text-destructive rounded-md border p-4 text-sm' role='alert'>
          {error}
        </div>
      ) : null}

      {preview ? (
        <Card data-import-preview>
          <CardHeader>
            <CardTitle>
              {preview.fields.length} fields · {MODE_LABELS[preview.mode]}
            </CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {preview.warnings.length ? (
              <ul className='list-disc pl-5 text-sm'>
                {preview.warnings.map(warning => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <ol className='flex max-h-[420px] flex-col gap-1 overflow-auto text-sm'>
              {preview.fields.map(field => (
                <li key={field.id} className={field.type === 'section' ? 'mt-2 font-semibold' : 'pl-4'}>
                  {field.label}
                  {field.type === 'section' ? null : <span className='text-textSecondary'> · {FORM_FIELD_TYPE_LABELS[field.type]}</span>}
                </li>
              ))}
            </ol>
            <div>
              <Button disabled={pending || !title.trim()} onClick={submit}>
                <TbFileImport />
                Create draft
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default FormBuilderImport
