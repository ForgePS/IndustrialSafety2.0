'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getForgePlatformAccess } from '@/lib/forgeCreatorAuth'

const supportRoles = ['forge_owner','forge_creator','forge_support']
const statuses = ['new','triaged','in_progress','waiting_on_customer','waiting_on_forge','resolved','closed'] as const
const categories = ['general','account','access','billing','bug','feature_request','data','integration','training','incident'] as const
const priorities = ['low','normal','high','urgent'] as const
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0,max) : ''
const permitted = (access: any, key: string) => access.effective.some((item: any) => item.permissionKey === key && item.allowed)

async function tenantAccess(key: string) {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) redirect('/auth/login')
  const access = await getEffectiveTenantAccess({organizationId:context.activeOrganization.id,userId:context.user.id})
  if (!permitted(access,key)) return null
  return {user:context.user,organizationId:context.activeOrganization.id,access}
}

async function staffAccess() {
  const {user,platformRole} = await getForgePlatformAccess()
  if (!user || !platformRole || !supportRoles.includes(platformRole)) return null
  return {user}
}

async function getTicket(id:string, organizationId?:string) {
  const db=createServiceRoleClient() as any
  let query=db.from('forge_support_tickets').select('*').eq('id',id)
  if (organizationId) query=query.eq('organization_id',organizationId)
  const {data,error}=await query.maybeSingle()
  if (error) return null
  return data
}

async function event(db:any,ticket:any,actor:string,type:string,fromValue?:string|null,toValue?:string|null,detail?:string|null) {
  const {error}=await db.from('forge_support_events').insert({
    organization_id:ticket.organization_id,ticket_id:ticket.id,actor_user_id:actor,
    event_type:type,from_value:fromValue||null,to_value:toValue||null,detail:detail||null
  })
  if(error) throw new Error('Unable to record support activity.')
}

function refresh(id:string) {
  revalidatePath('/support')
  revalidatePath('/support/'+id)
  revalidatePath('/admin/creator/support')
  revalidatePath('/admin/creator/support/'+id)
}

export async function createSupportTicket(form:FormData) {
  const actor=await tenantAccess('customer_support.create')
  if(!actor) return {error:'You do not have access to create support requests.'}
  const subject=clean(form.get('subject'),160)
  const description=clean(form.get('description'),10000)
  const category=clean(form.get('category'),40)
  const priority=clean(form.get('priority'),20)
  if(subject.length<4 || description.length<10) return {error:'Enter a subject (4+ characters) and description (10+ characters).'}
  if(!categories.includes(category as any) || !priorities.includes(priority as any)) return {error:'Choose a valid category and priority.'}
  const db=createServiceRoleClient() as any
  const {data:number,error:numberError}=await db.rpc('next_forge_support_number',{p_organization_id:actor.organizationId})
  if(numberError || !number) return {error:numberError?.message||'Unable to number request.'}
  const now=Date.now()
  const responseHours=priority==='urgent'?4:priority==='high'?8:priority==='normal'?24:48
  const resolutionHours=priority==='urgent'?24:priority==='high'?72:priority==='normal'?120:240
  const {data:ticket,error}=await db.from('forge_support_tickets').insert({
    organization_id:actor.organizationId,ticket_number:number,subject,description,category,priority,
    product_area:clean(form.get('product_area'),100)||null,page_url:clean(form.get('page_url'),500)||null,
    environment:clean(form.get('environment'),100)||null,requester_user_id:actor.user.id,
    first_response_due_at:new Date(now+responseHours*3600000).toISOString(),
    resolution_due_at:new Date(now+resolutionHours*3600000).toISOString()
  }).select('*').single()
  if(error || !ticket) return {error:error?.message||'Unable to create request.'}
  await event(db,ticket,actor.user.id,'created',null,'new')
  refresh(ticket.id)
  return {id:ticket.id}
}

export async function replyToSupportTicket(ticketId:string, body:string) {
  const actor=await tenantAccess('customer_support.view')
  if(!actor) return {error:'Access denied.'}
  const ticket=await getTicket(ticketId,actor.organizationId)
  if(!ticket) return {error:'Request not found.'}
  if(ticket.requester_user_id!==actor.user.id && !permitted(actor.access,'customer_support.company_reply')) return {error:'Access denied.'}
  if(ticket.status==='closed') return {error:'Reopen this request before replying.'}
  const text=clean(body,10000)
  if(!text) return {error:'Enter a message.'}
  const db=createServiceRoleClient() as any
  const {error}=await db.from('forge_support_messages').insert({
    organization_id:actor.organizationId,ticket_id:ticketId,author_user_id:actor.user.id,
    author_kind:'customer',visibility:'public',body:text
  })
  if(error) return {error:error.message}
  if(ticket.status==='waiting_on_customer') {
    await db.from('forge_support_tickets').update({status:'waiting_on_forge',updated_at:new Date().toISOString()})
      .eq('id',ticketId).eq('organization_id',actor.organizationId).eq('status','waiting_on_customer')
  } else {
    await db.from('forge_support_tickets').update({updated_at:new Date().toISOString()})
      .eq('id',ticketId).eq('organization_id',actor.organizationId)
  }
  await event(db,ticket,actor.user.id,'customer_reply')
  refresh(ticketId)
  return {message:'Reply sent.'}
}

export async function staffReplyToSupportTicket(ticketId:string,body:string,internal:boolean) {
  const actor=await staffAccess()
  if(!actor) return {error:'Access denied.'}
  const ticket=await getTicket(ticketId)
  if(!ticket) return {error:'Request not found.'}
  if(ticket.status==='closed') return {error:'Reopen the request before replying.'}
  const text=clean(body,10000)
  if(!text) return {error:'Enter a message.'}
  const db=createServiceRoleClient() as any
  const {error}=await db.from('forge_support_messages').insert({
    organization_id:ticket.organization_id,ticket_id:ticketId,author_user_id:actor.user.id,
    author_kind:'forge',visibility:internal?'internal':'public',body:text
  })
  if(error) return {error:error.message}
  if(!internal) {
    await db.from('forge_support_tickets').update({
      first_responded_at:ticket.first_responded_at||new Date().toISOString(),
      status:'waiting_on_customer',updated_at:new Date().toISOString()
    }).eq('id',ticketId).eq('organization_id',ticket.organization_id)
  } else {
    await db.from('forge_support_tickets').update({updated_at:new Date().toISOString()})
      .eq('id',ticketId).eq('organization_id',ticket.organization_id)
  }
  await event(db,ticket,actor.user.id,internal?'internal_note':'forge_reply')
  refresh(ticketId)
  return {message:internal?'Internal note saved.':'Reply sent.'}
}

export async function updateSupportTicket(ticketId:string,values:{status?:string;priority?:string;assignedTo?:string|null;resolutionSummary?:string}) {
  const actor=await staffAccess()
  if(!actor) return {error:'Access denied.'}
  const ticket=await getTicket(ticketId)
  if(!ticket) return {error:'Request not found.'}
  const status=values.status ?? ticket.status
  const priority=values.priority ?? ticket.priority
  if(!statuses.includes(status as any) || !priorities.includes(priority as any)) return {error:'Invalid status or priority.'}
  const summary=clean(values.resolutionSummary,4000)||ticket.resolution_summary
  if((status==='resolved'||status==='closed') && !summary) return {error:'A resolution summary is required.'}
  const db=createServiceRoleClient() as any
  const assignee=values.assignedTo===undefined?ticket.assigned_to:values.assignedTo||null
  if(assignee) {
    const {data:staff}=await db.from('forge_platform_users').select('user_id,platform_role,is_active').eq('user_id',assignee).maybeSingle()
    if(!staff?.is_active || !supportRoles.includes(staff.platform_role)) return {error:'Select an active Forge support team member.'}
  }
  const now=new Date().toISOString()
  const {data:after,error}=await db.from('forge_support_tickets').update({
    status,priority,assigned_to:assignee,resolution_summary:summary||null,
    resolved_at:['resolved','closed'].includes(status)?ticket.resolved_at||now:null,
    closed_at:status==='closed'?ticket.closed_at||now:null,updated_at:now
  }).eq('id',ticketId).eq('organization_id',ticket.organization_id).eq('updated_at',ticket.updated_at)
    .select('*').maybeSingle()
  if(error || !after) return {error:error?.message||'This request changed. Refresh and try again.'}
  if(ticket.status!==status) await event(db,ticket,actor.user.id,'status_changed',ticket.status,status)
  if(ticket.priority!==priority) await event(db,ticket,actor.user.id,'priority_changed',ticket.priority,priority)
  if(ticket.assigned_to!==assignee) await event(db,ticket,actor.user.id,'assignment_changed',ticket.assigned_to,assignee)
  refresh(ticketId)
  return {message:'Request updated.'}
}

export async function reopenSupportTicket(ticketId:string) {
  const actor=await tenantAccess('customer_support.view')
  if(!actor) return {error:'Access denied.'}
  const ticket=await getTicket(ticketId,actor.organizationId)
  if(!ticket) return {error:'Request not found.'}
  if(ticket.requester_user_id!==actor.user.id && !permitted(actor.access,'customer_support.company_reply')) return {error:'Access denied.'}
  if(!['resolved','closed'].includes(ticket.status)) return {error:'This request is already active.'}
  const db=createServiceRoleClient() as any
  const {data,error}=await db.from('forge_support_tickets').update({
    status:'waiting_on_forge',resolved_at:null,closed_at:null,updated_at:new Date().toISOString()
  }).eq('id',ticketId).eq('organization_id',actor.organizationId).eq('status',ticket.status).select('id').maybeSingle()
  if(error || !data) return {error:'Request changed. Refresh and retry.'}
  await event(db,ticket,actor.user.id,'reopened',ticket.status,'waiting_on_forge')
  refresh(ticketId)
  return {message:'Request reopened.'}
}
