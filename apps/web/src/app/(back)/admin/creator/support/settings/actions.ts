'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getForgePlatformAccess } from '@/lib/forgeCreatorAuth'

export async function updateSupportSla(input:{priority:string;firstResponseHours:number;resolutionHours:number}){
 const {user,platformRole}=await getForgePlatformAccess()
 if(!user||!platformRole||!['forge_owner','forge_creator'].includes(platformRole)) return {error:'Access denied.'}
 if(!['low','normal','high','urgent'].includes(input.priority)
  ||!Number.isInteger(input.firstResponseHours)||input.firstResponseHours<1||input.firstResponseHours>720
  ||!Number.isInteger(input.resolutionHours)||input.resolutionHours<1||input.resolutionHours>2160
  ||input.resolutionHours<input.firstResponseHours)
  return {error:'Enter valid response and resolution hours.'}
 const db=createServiceRoleClient() as any
 const {data:before}=await db.from('forge_support_sla_policies').select('*').eq('priority',input.priority).single()
 const {data:after,error}=await db.from('forge_support_sla_policies').update({
  first_response_hours:input.firstResponseHours,resolution_hours:input.resolutionHours,
  updated_at:new Date().toISOString()
 }).eq('priority',input.priority).select('*').single()
 if(error||!after) return {error:error?.message||'Unable to update targets.'}
 await db.from('forge_creator_audit_log').insert({
  actor_user_id:user.id,organization_id:null,action:'customer_support.sla_updated',
  entity_type:'support_sla',entity_id:null,before_value:before,after_value:after
 })
 revalidatePath('/admin/creator/support/settings')
 return {message:'Response targets updated. Existing tickets retain their original targets.'}
}
