'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { TbArchive, TbBook2, TbFileUpload, TbPlus, TbRefresh, TbSearch, TbSparkles } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  archiveForgeAiKnowledgeSource,
  indexKnowledgeSource,
  reindexStaleKnowledgeSources,
  saveForgeAiKnowledgeSource
} from './actions'

type Source = {
  id: string
  title: string
  description: string | null
  source_type: 'policy' | 'sop' | 'manual' | 'training_material' | 'document' | 'url' | 'other'
  sensitivity: 'public' | 'internal' | 'restricted'
  source_reference: string | null
  content_text: string | null
  status: 'draft' | 'processing' | 'active' | 'failed' | 'archived'
  chunk_count: number
  indexed_at: string | null
  index_error: string | null
  embedding_model: string | null
  current_version: number
  indexed_version: number | null
  retrieval_mode: 'hybrid' | 'lexical' | null
  updated_at: string
}

export type KnowledgeVersion = {
  source_id: string
  version_number: number
  origin: 'manual' | 'upload'
  file_name: string | null
  extractor: string | null
  page_count: number | null
  change_note: string | null
  created_at: string
}

const UPLOAD_ACCEPT = '.pdf,.docx,.md,.markdown,.txt'

type KnowledgeDraft = {
  title: string
  description: string
  sourceType: Source['source_type']
  sensitivity: Source['sensitivity']
  sourceReference: string
  contentText: string
}

const blankDraft: KnowledgeDraft = {
  title: '',
  description: '',
  sourceType: 'policy' as const,
  sensitivity: 'internal' as const,
  sourceReference: '',
  contentText: ''
}

const KnowledgeManager = ({ sources, versions }: { sources: Source[]; versions: KnowledgeVersion[] }) => {
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(sources[0]?.id || null)

  // After an upload the page reloads with ?source=<id>; open that source.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('source')

    if (requested && sources.some(source => source.id === requested)) setSelectedId(requested)
  }, [sources])
  const [creating, setCreating] = useState(sources.length === 0)
  const [newDraft, setNewDraft] = useState(blankDraft)
  const [drafts, setDrafts] = useState<Record<string, KnowledgeDraft>>(
    Object.fromEntries(
      sources.map(source => [
        source.id,
        {
          title: source.title,
          description: source.description || '',
          sourceType: source.source_type,
          sensitivity: source.sensitivity,
          sourceReference: source.source_reference || '',
          contentText: source.content_text || ''
        }
      ])
    )
  )

  const selected = sources.find(source => source.id === selectedId) || null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return sources.filter(source =>
      !q ||
      source.title.toLowerCase().includes(q) ||
      source.source_type.toLowerCase().includes(q) ||
      source.description?.toLowerCase().includes(q)
    )
  }, [sources, search])

  const save = (source?: Source) => {
    const draft = source ? drafts[source.id] : newDraft

    startTransition(async () => {
      const result = await saveForgeAiKnowledgeSource({
        sourceId: source?.id || null,
        title: draft.title,
        description: draft.description,
        sourceType: draft.sourceType,
        sensitivity: draft.sensitivity,
        sourceReference: draft.sourceReference,
        contentText: draft.contentText
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to save knowledge source.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const reindex = (source: Source) => {
    startTransition(async () => {
      const result = await indexKnowledgeSource(source.id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to index knowledge source.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  // Upload a file as a new source (no source) or as a new version of an existing one.
  const upload = async (file: File, draft: KnowledgeDraft, source?: Source) => {
    const form = new FormData()

    form.set('file', file)
    if (source) form.set('sourceId', source.id)
    if (draft.title.trim()) form.set('title', draft.title.trim())
    form.set('sourceType', draft.sourceType === 'url' ? 'document' : draft.sourceType)
    form.set('sensitivity', draft.sensitivity)
    if (draft.description.trim()) form.set('description', draft.description.trim())
    if (draft.sourceReference.trim()) form.set('sourceReference', draft.sourceReference.trim())

    setUploading(true)

    try {
      const response = await fetch('/api/forge-ai/knowledge/upload', { method: 'POST', body: form })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        toast('error', result.error || 'Upload failed.')

        return
      }

      toast(
        result.indexError ? 'error' : 'success',
        result.indexError
          ? 'Uploaded version ' + result.version + ', but indexing failed: ' + result.indexError
          : 'Uploaded version ' + result.version + (result.index ? ' and indexed ' + result.index.chunkCount + ' chunk(s).' : '.')
      )
      window.location.assign('/ai/knowledge?source=' + result.sourceId)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const reindexStale = () => {
    startTransition(async () => {
      const result = await reindexStaleKnowledgeSources()

      if ('error' in result) {
        toast('error', result.error || 'Unable to re-index knowledge.')

        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const archive = (source: Source) => {
    if (!window.confirm('Archive this knowledge source? Forge AI will stop using it immediately.')) return

    startTransition(async () => {
      const result = await archiveForgeAiKnowledgeSource(source.id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to archive knowledge source.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const renderEditor = ({
    source,
    draft,
    setDraft
  }: {
    source?: Source
    draft: typeof blankDraft
    setDraft: (next: typeof blankDraft) => void
  }) => (
    <div className='flex flex-col gap-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <CardTitle>{source ? source.title : 'New Knowledge Source'}</CardTitle>
              <CardDescription>
                Add approved company knowledge that Forge AI can retrieve when answering tenant questions.
              </CardDescription>
            </div>
            <Button onClick={() => save(source)} disabled={pending || !draft.title.trim() || !draft.contentText.trim()}>
              Save Source
            </Button>
          </div>
        </CardHeader>
        <CardContent className='grid gap-5 md:grid-cols-2'>
          <div>
            <Label>Title</Label>
            <Input className='mt-2' value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder='e.g. Lockout / Tagout Program' />
          </div>

          <div>
            <Label>Source Type</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              value={draft.sourceType}
              onChange={event => setDraft({ ...draft, sourceType: event.target.value as any })}
            >
              <option value='policy'>Policy</option>
              <option value='sop'>SOP</option>
              <option value='manual'>Manual</option>
              <option value='training_material'>Training Material</option>
              <option value='document'>Document</option>
              <option value='url'>URL / External Reference</option>
              <option value='other'>Other</option>
            </select>
          </div>

          <div>
            <Label>Sensitivity</Label>
            <select
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
              value={draft.sensitivity}
              onChange={event => setDraft({ ...draft, sensitivity: event.target.value as any })}
            >
              <option value='public'>Public</option>
              <option value='internal'>Internal</option>
              <option value='restricted'>Restricted</option>
            </select>
            <p className='text-textSecondary mt-1 text-xs'>Restricted sources require sensitive AI access in addition to normal Forge AI access.</p>
          </div>

          <div>
            <Label>Source Reference</Label>
            <Input className='mt-2' value={draft.sourceReference} onChange={event => setDraft({ ...draft, sourceReference: event.target.value })} placeholder='Policy number, document reference, or URL' />
          </div>

          <div className='md:col-span-2'>
            <Label>Description</Label>
            <Textarea className='mt-2' rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
          </div>

          <div className='md:col-span-2'>
            <Label>Approved Knowledge Text</Label>
            <Textarea
              className='mt-2 min-h-[420px] font-mono text-sm'
              value={draft.contentText}
              onChange={event => setDraft({ ...draft, contentText: event.target.value })}
              placeholder='Paste the approved policy, SOP, manual, training material, or other knowledge text here...'
            />
            <p className='text-textSecondary mt-2 text-xs'>Saving content does not automatically publish it to AI search. Index or reindex after review.</p>
          </div>

          <div className='md:col-span-2 rounded-lg border border-dashed p-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <div className='font-semibold'>{source ? 'Upload a new version' : 'Or upload a file'}</div>
                <div className='text-textSecondary text-xs'>
                  PDF, Word (.docx), Markdown or text, up to 10 MB. Forge extracts the text, keeps it as a numbered version and indexes it.
                  Scanned PDFs need OCR first.
                </div>
              </div>
              <input
                ref={fileInput}
                type='file'
                accept={UPLOAD_ACCEPT}
                className='hidden'
                aria-label='Knowledge file'
                onChange={event => {
                  const file = event.target.files?.[0]

                  if (file) void upload(file, draft, source)
                }}
              />
              <Button variant='outline' onClick={() => fileInput.current?.click()} disabled={pending || uploading}>
                <TbFileUpload />
                {uploading ? 'Uploading...' : 'Choose File'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {source ? (
        <Card>
          <CardHeader>
            <CardTitle>Search Index</CardTitle>
            <CardDescription>Forge splits the approved text into tenant-isolated chunks for full-text search, plus semantic search when an embedding provider is configured.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-5'>
              <div>
                <div className='text-textSecondary text-xs uppercase'>Status</div>
                <div className='mt-1'><Badge size='sm' variant={source.status === 'active' ? 'tonalSuccess' : source.status === 'failed' ? 'destructive' : 'secondary'}>{source.status}</Badge></div>
              </div>
              <div>
                <div className='text-textSecondary text-xs uppercase'>Chunks</div>
                <div className='mt-1 font-semibold'>{source.chunk_count || 0}</div>
              </div>
              <div>
                <div className='text-textSecondary text-xs uppercase'>Version</div>
                <div className='mt-1 font-semibold'>
                  {source.current_version ? 'v' + source.current_version : 'None'}
                  {source.current_version && source.indexed_version !== source.current_version ? (
                    <Badge size='sm' variant='accent' className='ms-2'>Not indexed</Badge>
                  ) : null}
                </div>
              </div>
              <div>
                <div className='text-textSecondary text-xs uppercase'>Search Mode</div>
                <div className='mt-1 font-semibold'>
                  {source.retrieval_mode === 'hybrid' ? 'Full-text + semantic' : source.retrieval_mode === 'lexical' ? 'Full-text' : 'Not indexed'}
                </div>
              </div>
              <div>
                <div className='text-textSecondary text-xs uppercase'>Last Indexed</div>
                <div className='mt-1 font-semibold'>{source.indexed_at ? new Date(source.indexed_at).toLocaleString() : 'Never'}</div>
              </div>
            </div>

            {source.index_error ? (
              <div className='mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>{source.index_error}</div>
            ) : null}

            <div className='mt-5 flex flex-wrap gap-2'>
              <Button onClick={() => reindex(source)} disabled={pending}><TbSparkles />{source.indexed_at ? 'Reindex Knowledge' : 'Index Knowledge'}</Button>
              <Button variant='destructive' onClick={() => archive(source)} disabled={pending}><TbArchive />Archive</Button>
            </div>

            {versions.some(version => version.source_id === source.id) ? (
              <div className='mt-6'>
                <div className='text-textSecondary mb-2 text-xs uppercase'>Version History</div>
                <div className='flex flex-col divide-y rounded-lg border'>
                  {versions
                    .filter(version => version.source_id === source.id)
                    .map(version => (
                      <div key={version.version_number} className='flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm'>
                        <div className='min-is-0'>
                          <span className='font-semibold'>v{version.version_number}</span>{' '}
                          <span className='text-textSecondary'>
                            {version.origin === 'upload' ? (version.file_name || 'Uploaded file') + (version.page_count ? ' · ' + version.page_count + ' pages' : '') : 'Edited in Forge'}
                            {version.change_note ? ' · ' + version.change_note : ''}
                          </span>
                        </div>
                        <div className='text-textSecondary flex items-center gap-2 text-xs'>
                          {source.indexed_version === version.version_number ? <Badge size='sm' variant='tonalSuccess'>Indexed</Badge> : null}
                          {new Date(version.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )

  return (
    <div className='grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]'>
      <div className='flex flex-col gap-4'>
        <Card>
          <CardContent className='p-4'>
            <div className='relative'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search knowledge...' className='pl-10' />
            </div>
            <Button className='mt-3 w-full' variant='outline' onClick={() => setCreating(true)}><TbPlus />New Source</Button>
            <Button className='mt-2 w-full' variant='outline' onClick={reindexStale} disabled={pending}><TbRefresh />Re-index Out-of-Date Sources</Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex max-h-[72vh] flex-col gap-2 overflow-y-auto p-4'>
            {filtered.map(source => (
              <button
                key={source.id}
                type='button'
                onClick={() => {
                  setSelectedId(source.id)
                  setCreating(false)
                }}
                className={'rounded-lg border p-3 text-left ' + (selectedId === source.id && !creating ? 'border-primary bg-primary/5' : 'hover:bg-neutral/5')}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='font-semibold'>{source.title}</div>
                  <Badge size='sm' variant={source.status === 'active' ? 'tonalSuccess' : source.status === 'failed' ? 'destructive' : 'secondary'}>{source.status}</Badge>
                </div>
                <div className='text-textSecondary mt-1 text-xs'>{source.source_type} · {source.sensitivity}</div>
                <div className='text-textSecondary mt-1 text-xs'>
                  {source.current_version ? 'v' + source.current_version + ' · ' : ''}{source.chunk_count || 0} indexed chunk(s)
                  {source.current_version && source.indexed_version !== source.current_version ? ' · needs indexing' : ''}
                </div>
              </button>
            ))}

            {!filtered.length ? <div className='text-textSecondary px-3 py-8 text-center text-sm'>No knowledge sources found.</div> : null}
          </CardContent>
        </Card>
      </div>

      {creating
        ? renderEditor({
            draft: newDraft,
            setDraft: setNewDraft
          })
        : selected
          ? renderEditor({
              source: selected,
              draft: drafts[selected.id],
              setDraft: next => setDrafts(current => ({ ...current, [selected.id]: next }))
            })
          : (
            <Card>
              <CardContent className='flex min-h-[300px] flex-col items-center justify-center p-8 text-center'>
                <TbBook2 className='text-primary size-10' />
                <div className='mt-4 text-lg font-semibold'>No knowledge source selected</div>
                <div className='text-textSecondary mt-2 text-sm'>Create a source to start building this tenant's Forge AI knowledge base.</div>
              </CardContent>
            </Card>
          )}
    </div>
  )
}

export default KnowledgeManager
