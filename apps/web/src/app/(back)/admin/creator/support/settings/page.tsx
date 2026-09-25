import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import SettingsForm from './SettingsForm'
export const metadata:Metadata={title:'Support Settings'}
export default async function SupportSettings(){
 await requireForgePlatformRole(['forge_owner','forge_creator'])
 const db=createServiceRoleClient() as any
 const {data,error}=await db.from('forge_support_sla_policies').select('priority,first_response_hours,resolution_hours')
 if(error) throw new Error('Unable to load support response targets.')
 const order=['low','normal','high','urgent']
 return <SettingsForm policies={(data||[]).sort((a:any,b:any)=>order.indexOf(a.priority)-order.indexOf(b.priority))} />
}
