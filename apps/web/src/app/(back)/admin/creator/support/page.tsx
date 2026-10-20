import Link from 'next/link'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import SupportDesk from '@/app/(back)/support/SupportDesk'
import SupportInbox from '@/app/(back)/support/SupportInbox'
import { getSupportInbox } from '@/lib/forgeSupportOperations'
export const metadata:Metadata={title:'Forge Support Queue'}
export default async function ForgeSupportPage(){
 const {platformRole}=await requireForgePlatformRole(['forge_owner','forge_creator','forge_support'])
 const db=createServiceRoleClient() as any
 const fields='id,organization_id,ticket_number,subject,category,priority,status,requester_user_id,created_at,updated_at,first_response_due_at,first_responded_at,resolution_due_at'
 const activeStatuses=['new','triaged','in_progress','waiting_on_customer','waiting_on_forge']
 const [{data:active,error:activeError},{data:recent,error:recentError}]=await Promise.all([
  db.from('forge_support_tickets').select(fields).in('status',activeStatuses).order('updated_at',{ascending:false}).limit(100),
  db.from('forge_support_tickets').select(fields).in('status',['resolved','closed']).order('updated_at',{ascending:false}).limit(100)
 ])
 if(activeError||recentError) throw new Error('Unable to load support queue.')
 const data=[...(active||[]),...(recent||[])]
 const ids=[...new Set(data.map((t:any)=>t.organization_id))]
 const {data:orgs}=ids.length?await db.from('organizations').select('id,name').in('id',ids):{data:[]}
 const names=new Map((orgs||[]).map((o:any)=>[o.id,o.name]))
 const notices=await getSupportInbox('staff')
 return <><div className='mb-4'><Link href='/admin/creator/support/reports' className='text-primary font-medium underline'>Support reports</Link></div><SupportInbox staff notices={notices} /><SupportDesk staff canSettings={platformRole!=='forge_support'} tickets={(data||[]).map((t:any)=>({...t,organizationName:names.get(t.organization_id)||'Company'}))} /></>
}
