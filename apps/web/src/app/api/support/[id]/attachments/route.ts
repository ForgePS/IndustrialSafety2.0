import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getForgePlatformRole } from '@/lib/forgeCreatorAuth'

const allowedTypes=new Set(['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv'])
const staffRoles=['forge_owner','forge_creator','forge_support']
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const {data:{user}}=await getAuthUser()
 if(!user) return NextResponse.json({error:'Sign in required.'},{status:401})
 if(Number(request.headers.get('content-length')||0)>11500000) return NextResponse.json({error:'File is too large.'},{status:413})
 const {id}=await params
 const db=createServiceRoleClient() as any
 const {data:ticket}=await db.from('forge_support_tickets').select('id,organization_id,requester_user_id,status').eq('id',id).maybeSingle()
 if(!ticket) return NextResponse.json({error:'Request not found.'},{status:404})
 const platformRole=await getForgePlatformRole(user.id)
 const staff=Boolean(platformRole&&staffRoles.includes(platformRole))
 const context=await getTenantContext()
 let customer=false
 if(context.activeOrganization?.id===ticket.organization_id){
  const access=await getEffectiveTenantAccess({organizationId:ticket.organization_id,userId:user.id})
  const has=(key:string)=>access.effective.some(p=>p.permissionKey===key&&p.allowed)
  customer=has('customer_support.view')&&
   (ticket.requester_user_id===user.id||has('customer_support.company_reply'))
 }
 if(!staff&&!customer) return NextResponse.json({error:'Request not found.'},{status:404})
 if(['resolved','closed'].includes(ticket.status)) return NextResponse.json({error:'Reopen the request before attaching files.'},{status:409})
 const data=await request.formData()
 const file=data.get('file')
 const visibility=data.get('visibility')==='internal'?'internal':'public'
 if(visibility==='internal'&&!staff) return NextResponse.json({error:'Access denied.'},{status:403})
 if(!(file instanceof File)||file.size<1||file.size>10485760||!allowedTypes.has(file.type))
  return NextResponse.json({error:'Choose a PNG, JPG, WebP, PDF, TXT, or CSV file under 10 MB.'},{status:400})
 const filename=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,255)||'attachment'
 const attachmentId=crypto.randomUUID()
 const path=ticket.organization_id+'/'+ticket.id+'/'+attachmentId
 const {error:uploadError}=await db.storage.from('forge-support').upload(path,await file.arrayBuffer(),{contentType:file.type,upsert:false})
 if(uploadError) return NextResponse.json({error:'Unable to upload attachment.'},{status:500})
 const {data:record,error}=await db.from('forge_support_attachments').insert({
  id:attachmentId,organization_id:ticket.organization_id,ticket_id:ticket.id,uploaded_by:user.id,
  visibility,storage_path:path,file_name:filename,mime_type:file.type,byte_size:file.size
 }).select('id').single()
 if(error||!record){
  await db.storage.from('forge-support').remove([path])
  return NextResponse.json({error:'Unable to save attachment.'},{status:500})
 }
 await db.from('forge_support_events').insert({
  organization_id:ticket.organization_id,ticket_id:ticket.id,actor_user_id:user.id,
  event_type:visibility==='internal'?'internal_attachment':'attachment_added',detail:filename
 })
 await db.from('forge_support_tickets').update({updated_at:new Date().toISOString()})
  .eq('organization_id',ticket.organization_id).eq('id',ticket.id)
 return NextResponse.json({id:record.id})
}
