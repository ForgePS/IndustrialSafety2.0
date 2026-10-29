'use client'

import { useState } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArrowLeft, TbPaperclip } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { knowledgeStatusLabels, knowledgeVisibilityLabels, label } from '@/lib/forgeHelpdesk'
import KnowledgeBody from '@/components/helpdesk/KnowledgeBody'
import { useActionRunner } from '@/components/helpdesk/useActionRunner'
import { saveArticleAction, transitionArticleAction } from '../actions'

type Props = {
  basePath: string
  article: any | null
  initial: { title: string; slug: string; summary: string; body: string; sourceTicketId: string | null }
  categories: { id: string; name: string }[]
  areas: { id: string; label: string }[]
  tenants: { id: string; name: string }[]
  permissions: string[]
  revisions: any[]
  feedback: any[]
  attachments: any[]
}

const TRANSITIONS: Record<string, { to: string; text: string; permission: string; variant?: 'default' | 'outline' | 'destructive' }[]> = {
  draft: [
    { to: 'review', text: 'Submit for review', permission: 'helpdesk.knowledge.edit' },
    { to: 'published', text: 'Publish now', permission: 'helpdesk.knowledge.publish', variant: 'outline' },
    { to: 'archived', text: 'Archive', permission: 'helpdesk.knowledge.archive', variant: 'destructive' }
  ],
  review: [
    { to: 'published', text: 'Approve & publish', permission: 'helpdesk.knowledge.publish' },
    { to: 'draft', text: 'Request changes', permission: 'helpdesk.knowledge.review', variant: 'outline' },
    { to: 'archived', text: 'Archive', permission: 'helpdesk.knowledge.archive', variant: 'destructive' }
  ],
  published: [
    { to: 'draft', text: 'Unpublish to draft', permission: 'helpdesk.knowledge.publish', variant: 'outline' },
    { to: 'archived', text: 'Archive', permission: 'helpdesk.knowledge.archive', variant: 'destructive' }
  ],
  archived: [{ to: 'draft', text: 'Restore as draft', permission: 'helpdesk.knowledge.edit', variant: 'outline' }]
}

const ArticleEditor = ({ basePath, article, initial, categories, areas, tenants, permissions, revisions, feedback, attachments }: Props) => {
  const router = useRouter()
  const can = (key: string) => permissions.includes(key)
  const { pending, notice, run, setNotice } = useActionRunner()

  const [form, setForm] = useState({
    title: initial.title,
    slug: initial.slug,
    summary: initial.summary,
    body: initial.body,
    categoryId: article?.category_id || categories[0]?.id || '',
    moduleId: article?.module_id || '',
    visibility: article?.visibility || 'authenticated_users',
    organizationId: article?.organization_id || '',
    searchKeywords: article?.search_keywords || '',
    changeNote: ''
  })

  const [preview, setPreview] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }))
  const editable = article ? can('helpdesk.knowledge.edit') && article.status !== 'archived' : can('helpdesk.knowledge.create')

  const save = () =>
    run(
      () =>
        saveArticleAction({
          articleId: article?.id || null,
          expectedRowVersion: article?.row_version ?? null,
          title: form.title,
          slug: form.slug,
          summary: form.summary,
          body: form.body,
          categoryId: form.categoryId,
          moduleId: form.moduleId || null,
          visibility: form.visibility,
          organizationId: form.visibility === 'tenant_only' ? form.organizationId : null,
          searchKeywords: form.searchKeywords,
          sourceTicketId: initial.sourceTicketId,
          changeNote: form.changeNote
        }),
      article ? 'Article saved as a new version.' : 'Draft created.',
      result => {
        set({ changeNote: '' })
        if (!article) router.push(`/help-desk/console/knowledge/${result.article_id}`)
      }
    )

  const upload = async (file: File) => {
    if (!article) return
    setUploading(true)
    setNotice(null)

    try {
      const body = new FormData()

      body.set('file', file)
      const res = await fetch(`${basePath}/api/helpdesk/knowledge/${article.id}/attachments`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) setNotice({ tone: 'error', text: data.error || 'Upload failed.' })
      else {
        setNotice({ tone: 'ok', text: `${data.fileName} uploaded.` })
        router.refresh()
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/help-desk/console/knowledge' className='text-primary flex items-center gap-1 text-sm'>
          <TbArrowLeft />
          Knowledge base
        </Link>
        <div className='mt-1 flex flex-wrap items-center gap-2'>
          <h1 className='text-textPrimary text-2xl font-bold'>{article ? article.title : 'New article'}</h1>
          {article ? (
            <Badge size='sm' variant={article.status === 'published' ? 'tonalSuccess' : 'outline'}>
              {label(knowledgeStatusLabels, article.status)} · v{article.version}
            </Badge>
          ) : null}
        </div>
        {article?.status === 'published' ? (
          <Link className='text-primary text-sm underline' href={`/help-desk/articles/${article.slug}`} target='_blank'>
            View in Help Center
          </Link>
        ) : null}
      </div>

      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'text-destructive text-sm' : 'text-sm'}>
          {notice.text}
        </p>
      ) : null}

      <div className='grid gap-6 xl:grid-cols-3'>
        <Card className='xl:col-span-2'>
          <CardContent className='flex flex-col gap-4 p-6'>
            <div className='grid gap-4 md:grid-cols-2'>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Title
                <Input maxLength={200} value={form.title} disabled={!editable} onChange={e => set({ title: e.target.value, slug: article ? form.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) })} />
              </label>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                URL slug
                <Input maxLength={120} value={form.slug} disabled={!editable} onChange={e => set({ slug: e.target.value })} />
              </label>
            </div>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Summary
              <Textarea rows={2} maxLength={500} value={form.summary} disabled={!editable} onChange={e => set({ summary: e.target.value })} />
            </label>
            <div className='grid gap-4 md:grid-cols-3'>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Category
                <select value={form.categoryId} disabled={!editable} onChange={e => set({ categoryId: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Product area
                <select value={form.moduleId} disabled={!editable} onChange={e => set({ moduleId: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                  <option value=''>Any</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Visibility
                <select value={form.visibility} disabled={!editable} onChange={e => set({ visibility: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                  {Object.entries(knowledgeVisibilityLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.visibility === 'tenant_only' ? (
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Tenant
                <select value={form.organizationId} disabled={!editable} onChange={e => set({ organizationId: e.target.value })} className='border-input bg-card h-[38px] rounded-md border px-3 text-sm'>
                  <option value=''>Choose tenant…</option>
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className='flex flex-col gap-1 text-sm font-medium'>
              Search keywords
              <Input maxLength={1000} value={form.searchKeywords} disabled={!editable} onChange={e => set({ searchKeywords: e.target.value })} placeholder='Synonyms customers might type, comma separated' />
            </label>
            <div className='flex flex-col gap-2'>
              <div className='flex items-center justify-between'>
                <span className='text-sm font-medium'>Body</span>
                <div className='flex gap-1'>
                  <Button type='button' size='xs' variant={preview ? 'ghost' : 'tonal'} onClick={() => setPreview(false)}>
                    Write
                  </Button>
                  <Button type='button' size='xs' variant={preview ? 'tonal' : 'ghost'} onClick={() => setPreview(true)}>
                    Preview
                  </Button>
                </div>
              </div>
              {preview ? (
                <div className='min-h-[320px] rounded-md border p-4'>
                  <KnowledgeBody body={form.body || ' '} />
                </div>
              ) : (
                <Textarea rows={16} maxLength={100000} value={form.body} disabled={!editable} onChange={e => set({ body: e.target.value })} className='font-mono text-sm' aria-label='Article body' />
              )}
              <p className='text-textSecondary text-xs'>Formatting: ## Heading, ### Subheading, 1. numbered steps, - bullets, **bold**.</p>
            </div>
            {editable ? (
              <div className='flex flex-wrap items-end gap-2'>
                {article ? (
                  <label className='flex flex-1 flex-col gap-1 text-sm font-medium'>
                    Change note
                    <Input maxLength={500} value={form.changeNote} onChange={e => set({ changeNote: e.target.value })} placeholder='What changed in this version?' />
                  </label>
                ) : null}
                <Button type='button' disabled={pending || form.title.trim().length < 4 || !form.body.trim() || !form.categoryId || (form.visibility === 'tenant_only' && !form.organizationId)} onClick={save}>
                  {article ? 'Save new version' : 'Create draft'}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className='flex flex-col gap-6'>
          {article ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Workflow</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2'>
                {(TRANSITIONS[article.status] || [])
                  .filter(t => can(t.permission))
                  .map(t => (
                    <Button
                      key={t.to}
                      type='button'
                      size='sm'
                      variant={t.variant || 'default'}
                      disabled={pending}
                      onClick={() => run(() => transitionArticleAction({ articleId: article.id, toStatus: t.to, expectedRowVersion: article.row_version }), `Article moved to ${label(knowledgeStatusLabels, t.to)}.`)}
                    >
                      {t.text}
                    </Button>
                  ))}
                <p className='text-textSecondary text-xs'>
                  {article.view_count} views · {article.helpful_count} helpful · {article.not_helpful_count} not helpful
                </p>
              </CardContent>
            </Card>
          ) : null}

          {article ? (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <TbPaperclip />
                  Media
                </CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 text-sm'>
                {attachments.map(a => (
                  <a key={a.id} className='text-primary truncate underline' href={`${basePath}/api/helpdesk/knowledge/media/${a.id}`} target='_blank' rel='noreferrer'>
                    {a.file_name}
                  </a>
                ))}
                {!attachments.length ? <p className='text-textSecondary'>No media yet.</p> : null}
                {editable ? (
                  <label className='text-primary cursor-pointer text-sm underline'>
                    {uploading ? 'Uploading…' : 'Upload image, PDF or video'}
                    <input
                      type='file'
                      className='sr-only'
                      accept='image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm'
                      disabled={uploading}
                      onChange={e => {
                        const file = e.target.files?.[0]

                        e.target.value = ''
                        if (file) void upload(file)
                      }}
                    />
                  </label>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {revisions.length ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Versions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className='flex flex-col gap-2 text-xs'>
                  {revisions.map(r => (
                    <li key={r.id}>
                      <span className='font-semibold'>v{r.version}</span> · {r.edited_by_name} · {new Date(r.created_at).toLocaleString()}
                      {r.change_note ? <span className='text-textSecondary block'>{r.change_note}</span> : null}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}

          {feedback.length ? (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Reader feedback</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-col gap-2 text-sm'>
                {feedback.map((f, i) => (
                  <p key={i}>
                    <span className={f.helpful ? 'text-success' : 'text-destructive'}>{f.helpful ? 'Helpful' : 'Not helpful'}</span> — {f.comment}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default ArticleEditor
