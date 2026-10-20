import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import SupportDesk from './SupportDesk'
import SupportInbox from './SupportInbox'
import { getSupportInbox } from '@/lib/forgeSupportOperations'
export const metadata:Metadata={title:'Customer Support'}
export default async function SupportPage(){
 const context=await requireTenantPermission('customer_support.view')
 const organizationId=context.activeOrganization.id
 const companyView=context.access.effective.some(p=>p.permissionKey==='customer_support.company_view'&&p.allowed)
 const db=createServiceRoleClient() as any
 let query=db.from('forge_support_tickets').select('id,ticket_number,subject,category,priority,status,created_at,updated_at,first_response_due_at,first_responded_at,resolution_due_at').eq('organization_id',organizationId)
 if(!companyView) query=query.eq('requester_user_id',context.user.id)
 const {data,error}=await query.order('updated_at',{ascending:false}).limit(100)
 if(error) throw new Error('Unable to load support requests.')
 const notices=await getSupportInbox('customer')
 return <><SupportInbox notices={notices} /><SupportDesk tickets={data||[]} canCreate={context.access.effective.some(p=>p.permissionKey==='customer_support.create'&&p.allowed)} /></>
}
