import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import KnowledgeManager from './KnowledgeManager'
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

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Knowledge</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Manage approved tenant policies, SOPs, manuals and training material used by Forge AI semantic retrieval.
          </p>
        </div>
        <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
      </div>

      <KnowledgeManager sources={sources || []} />
    </div>
  )
}

export default ForgeAiKnowledgePage
