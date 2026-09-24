import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import SupportDesk from '@/app/(back)/support/SupportDesk'
export const metadata:Metadata={title:'Forge Support Queue'}
export default async function ForgeSupportPage(){
 const {platformRole}=await requireForgePlatformRole(['forge_owner','forge_creator','forge_support'])
 const db=createServiceRoleClient() as any
 const {data,error}=await db.from('forge_support_tickets')
  .select('id,organization_id,ticket_number,subject,category,priority,status,requester_user_id,created_at,updated_at,first_response_due_at,resolution_due_at')
  .order('updated_at',{ascending:false}).limit(100)
 if(error) throw new Error('Unable to load support queue.')
 const ids=[...new Set((data||[]).map((t:any)=>t.organization_id))]
 const {data:orgs}=ids.length?await db.from('organizations').select('id,name').in('id',ids):{data:[]}
 const names=new Map((orgs||[]).map((o:any)=>[o.id,o.name]))
 return <SupportDesk staff canSettings={platformRole!=='forge_support'} tickets={(data||[]).map((t:any)=>({...t,organizationName:names.get(t.organization_id)||'Company'}))} />
}
