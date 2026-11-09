import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import KnowledgeManager, { type KnowledgeVersion } from './KnowledgeManager'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Knowledge' }

const ForgeAiKnowledgePage = async () => {
  const context = await requireTenantPermission('forge_ai.manage_knowledge')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: sources } = await supabase
    .from('forge_ai_knowledge_sources')
    .select('*')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  const sourceIds = (sources || []).map((source: any) => source.id)
  const { data: versions } = sourceIds.length
    ? await supabase
        .from('forge_ai_knowledge_source_versions')
        .select('source_id, version_number, origin, file_name, extractor, page_count, change_note, created_at')
        .eq('organization_id', organizationId)
        .in('source_id', sourceIds)
        .order('version_number', { ascending: false })
        .limit(500)
    : { data: [] }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Knowledge</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Manage approved tenant policies, SOPs, manuals and training material. Upload PDF or Word files or paste text; every change is kept as a version, and Forge AI cites the source it used.
          </p>
        </div>
        <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
      </div>

      <KnowledgeManager sources={sources || []} versions={(versions || []) as KnowledgeVersion[]} />
    </div>
  )
}

export default ForgeAiKnowledgePage
