import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import ExperienceManager from './ExperienceManager'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Experience Builder | Forge Creator 2.0' }

const ExperiencePage = async () => {
  await requireForgePlatformRole()
  const supabase = createServiceRoleClient() as any
  const { data: elements, error } = await supabase
    .from('forge_experience_elements')
    .select('*')
    .order('category')
    .order('sort_order')

  if (error) throw new Error(`Unable to load Creator experience registry: ${error.message}`)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Experience Builder</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Control how Forge looks, reads, behaves, and what customers are allowed to customize without changing protected system keys.
        </p>
      </div>

      <ExperienceManager elements={elements || []} />
    </div>
  )
}

export default ExperiencePage
