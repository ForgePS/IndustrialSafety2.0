import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import SupportConversation from '../SupportConversation'
export const metadata:Metadata={title:'Support Request'}
export default async function SupportDetail({params}:{params:Promise<{id:string}>}){
 const context=await requireTenantPermission('customer_support.view')
 const {id}=await params
 const organizationId=context.activeOrganization.id
 const db=createServiceRoleClient() as any
 const {data:ticket}=await db.from('forge_support_tickets').select('*').eq('organization_id',organizationId).eq('id',id).maybeSingle()
 if(!ticket) notFound()
 const companyView=context.access.effective.some(p=>p.permissionKey==='customer_support.company_view'&&p.allowed)
 const companyReply=context.access.effective.some(p=>p.permissionKey==='customer_support.company_reply'&&p.allowed)
 if(ticket.requester_user_id!==context.user.id&&!companyView) notFound()
 const [{data:messages,error:messageError},{data:events,error:eventError}]=await Promise.all([
  db.from('forge_support_messages').select('id,author_kind,visibility,body,created_at').eq('organization_id',organizationId).eq('ticket_id',id).eq('visibility','public').order('created_at',{ascending:true}).limit(200),
  db.from('forge_support_events').select('id,event_type,from_value,to_value,detail,created_at').eq('organization_id',organizationId).eq('ticket_id',id).not('event_type','in','(internal_note,assignment_changed)').order('created_at',{ascending:true}).limit(200)
 ])
 if(messageError||eventError) throw new Error('Unable to load support conversation.')
 return <SupportConversation ticket={ticket} messages={messages||[]} events={events||[]} canReply={ticket.requester_user_id===context.user.id||companyReply} />
}
