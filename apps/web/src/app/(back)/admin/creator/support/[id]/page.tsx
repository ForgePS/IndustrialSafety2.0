import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import SupportConversation from '@/app/(back)/support/SupportConversation'
export const metadata:Metadata={title:'Forge Support Request'}
export default async function ForgeSupportDetail({params}:{params:Promise<{id:string}>}){
 await requireForgePlatformRole(['forge_owner','forge_creator','forge_support'])
 const {id}=await params
 const db=createServiceRoleClient() as any
 const {data:ticket}=await db.from('forge_support_tickets').select('*').eq('id',id).maybeSingle()
 if(!ticket) notFound()
 const [{data:messages,error:messageError},{data:events,error:eventError},{data:staff,error:staffError}]=await Promise.all([
  db.from('forge_support_messages').select('id,author_kind,visibility,body,created_at').eq('organization_id',ticket.organization_id).eq('ticket_id',id).order('created_at',{ascending:true}).limit(500),
  db.from('forge_support_events').select('id,event_type,from_value,to_value,detail,created_at').eq('organization_id',ticket.organization_id).eq('ticket_id',id).order('created_at',{ascending:true}).limit(500),
  db.from('forge_platform_users').select('user_id,platform_role').eq('is_active',true).in('platform_role',['forge_owner','forge_creator','forge_support'])
 ])
 if(messageError||eventError||staffError) throw new Error('Unable to load support record.')
 return <SupportConversation staff ticket={ticket} messages={messages||[]} events={events||[]} staffUsers={(staff||[]).map((s:any)=>({user_id:s.user_id,label:s.platform_role.replaceAll('_',' ')+' · '+s.user_id.slice(0,8)}))} />
}
