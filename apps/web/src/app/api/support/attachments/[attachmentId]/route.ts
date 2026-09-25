import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getForgePlatformRole } from '@/lib/forgeCreatorAuth'

export async function GET(_request:Request,{params}:{params:Promise<{attachmentId:string}>}){
 const {data:{user}}=await getAuthUser()
 if(!user) return NextResponse.json({error:'Sign in required.'},{status:401})
 const {attachmentId}=await params
 const db=createServiceRoleClient() as any
 const {data:file}=await db.from('forge_support_attachments')
  .select('organization_id,ticket_id,visibility,storage_path,file_name').eq('id',attachmentId).maybeSingle()
 if(!file) return NextResponse.json({error:'Attachment not found.'},{status:404})
 const role=await getForgePlatformRole(user.id)
 const staff=Boolean(role&&['forge_owner','forge_creator','forge_support'].includes(role))
 if(!staff){
  if(file.visibility==='internal') return NextResponse.json({error:'Attachment not found.'},{status:404})
  const context=await getTenantContext()
  if(context.activeOrganization?.id!==file.organization_id) return NextResponse.json({error:'Attachment not found.'},{status:404})
  const access=await getEffectiveTenantAccess({organizationId:file.organization_id,userId:user.id})
  const has=(key:string)=>access.effective.some(p=>p.permissionKey===key&&p.allowed)
  if(!has('customer_support.view')) return NextResponse.json({error:'Attachment not found.'},{status:404})
  const {data:ticket}=await db.from('forge_support_tickets').select('requester_user_id')
   .eq('id',file.ticket_id).eq('organization_id',file.organization_id).maybeSingle()
  if(!ticket||(ticket.requester_user_id!==user.id&&!has('customer_support.company_view')))
   return NextResponse.json({error:'Attachment not found.'},{status:404})
 }
 const {data,error}=await db.storage.from('forge-support').createSignedUrl(file.storage_path,60,{download:file.file_name})
 if(error||!data?.signedUrl) return NextResponse.json({error:'Unable to download attachment.'},{status:500})
 return NextResponse.redirect(data.signedUrl,{headers:{'Cache-Control':'private, no-store'}})
}
