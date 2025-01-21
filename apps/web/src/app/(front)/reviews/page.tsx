import Reviews from '@repo/ui/blocks/reviews/Reviews'

import { createClient } from '@repo/supabase/server'

const page = async () => {
  const supabase = await createClient()

  const { data } = await supabase.from('reviews').select('*').order('id', { ascending: true })

  const { data: platformData } = await supabase
    .from('review_platforms')
    .select('id, logo, platform_name')
    .order('id', { ascending: true })

  return (
    <div>
      <Reviews data={data || []} platformData={platformData || []} />
    </div>
  )
}

export default page
