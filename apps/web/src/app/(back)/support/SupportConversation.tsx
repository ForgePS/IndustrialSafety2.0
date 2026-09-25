'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card,CardContent,CardHeader,CardTitle,CardDescription } from '@repo/ui/components/ui/card'
import { replyToSupportTicket,staffReplyToSupportTicket,updateSupportTicket,reopenSupportTicket } from './actions'

type Ticket={id:string;ticket_number:string;subject:string;description:string;category:string;priority:string;status:string;product_area:string|null;page_url:string|null;environment:string|null;first_response_due_at:string|null;resolution_due_at:string|null;first_responded_at:string|null;resolution_summary:string|null;assigned_to:string|null;created_at:string}
type Message={id:string;author_kind:string;visibility:string;body:string;created_at:string}
type Event={id:number;event_type:string;from_value:string|null;to_value:string|null;detail:string|null;created_at:string}
type Attachment={id:string;file_name:string;visibility:string;byte_size:number;created_at:string}
export default function SupportConversation({ticket,messages,events,attachments=[],staff=false,canReply=true,staffUsers=[],basePath=''}:{ticket:Ticket;messages:Message[];events:Event[];attachments?:Attachment[];staff?:boolean;canReply?:boolean;staffUsers?:{user_id:string;label:string}[];basePath?:string}){
 const router=useRouter()
 const [body,setBody]=useState('')
 const [file,setFile]=useState<File|null>(null)
 const [privateFile,setPrivateFile]=useState(false)
 const [internal,setInternal]=useState(false)
 const [status,setStatus]=useState(ticket.status)
 const [priority,setPriority]=useState(ticket.priority)
 const [assignee,setAssignee]=useState(ticket.assigned_to||'')
 const [summary,setSummary]=useState(ticket.resolution_summary||'')
 const [error,setError]=useState('')
 const [success,setSuccess]=useState('')
 const [pending,start]=useTransition()
 const normalizedBasePath=basePath?'/'+basePath.replace(/^\/+|\/+$/g,''):''
 useEffect(()=>{
  setStatus(ticket.status)
  setPriority(ticket.priority)
  setAssignee(ticket.assigned_to||'')
  setSummary(ticket.resolution_summary||'')
 },[ticket.id,ticket.status,ticket.priority,ticket.assigned_to,ticket.resolution_summary])
 const act=(fn:()=>Promise<{error?:string;message?:string}>)=>{setError('');setSuccess('');start(async()=>{try{const result=await fn();if(result.error)setError(result.error);else {setSuccess(result.message||'Saved.');router.refresh()}}catch{setError('Unable to save. Try again.')}})}
 const terminal=['resolved','closed'].includes(ticket.status)
 return <div className='flex flex-col gap-6'>
  <div><Link href={staff?'/admin/creator/support':'/support'} className='text-primary text-sm'>← Back to support</Link>
   <div className='mt-3 flex flex-wrap items-center gap-2'><h1 className='text-3xl font-bold'>{ticket.subject}</h1><Badge size='sm' variant={ticket.priority==='urgent'?'destructive':'outline'}>{ticket.priority}</Badge><Badge size='sm' variant={ticket.status==='resolved'?'tonalSuccess':'outline'}>{ticket.status.replaceAll('_',' ')}</Badge></div>
   <p className='text-textSecondary mt-2'>{ticket.ticket_number} · {ticket.category.replaceAll('_',' ')} · Opened {new Date(ticket.created_at).toLocaleString()}</p>
  </div>
  <div className='grid gap-4 sm:grid-cols-3'>
   <Card><CardContent className='p-4'><p className='text-textSecondary text-sm'>First response</p><p className='font-semibold'>{ticket.first_responded_at?new Date(ticket.first_responded_at).toLocaleString():'Pending'}</p><p className='text-textSecondary text-xs'>Target: {ticket.first_response_due_at?new Date(ticket.first_response_due_at).toLocaleString():'—'}</p></CardContent></Card>
   <Card><CardContent className='p-4'><p className='text-textSecondary text-sm'>Resolution target</p><p className='font-semibold'>{ticket.resolution_due_at?new Date(ticket.resolution_due_at).toLocaleString():'—'}</p></CardContent></Card>
   <Card><CardContent className='p-4'><p className='text-textSecondary text-sm'>Product area</p><p className='font-semibold'>{ticket.product_area||'Not specified'}</p><p className='text-textSecondary text-xs'>{ticket.environment||''}</p></CardContent></Card>
  </div>
  <Card><CardHeader><CardTitle>Request details</CardTitle></CardHeader><CardContent><p className='whitespace-pre-wrap'>{ticket.description}</p>{ticket.page_url?<p className='text-textSecondary mt-3 break-all text-sm'>Page: {ticket.page_url}</p>:null}</CardContent></Card>
  {ticket.resolution_summary?<Card><CardHeader><CardTitle>Resolution</CardTitle></CardHeader><CardContent><p className='whitespace-pre-wrap'>{ticket.resolution_summary}</p></CardContent></Card>:null}
  {staff?<Card><CardHeader><CardTitle>Manage request</CardTitle><CardDescription>Assignments and status changes are recorded in the activity log.</CardDescription></CardHeader><CardContent className='grid gap-4'>
   <div className='grid gap-4 sm:grid-cols-3'>
    <label className='grid gap-1 text-sm'>Status<select value={status} onChange={e=>setStatus(e.target.value)} className='border-input bg-card rounded-md border p-2'>{['new','triaged','in_progress','waiting_on_customer','waiting_on_forge','resolved','closed'].map(s=><option value={s} key={s}>{s.replaceAll('_',' ')}</option>)}</select></label>
    <label className='grid gap-1 text-sm'>Priority<select value={priority} onChange={e=>setPriority(e.target.value)} className='border-input bg-card rounded-md border p-2'>{['low','normal','high','urgent'].map(s=><option value={s} key={s}>{s}</option>)}</select></label>
    <label className='grid gap-1 text-sm'>Assigned to<select value={assignee} onChange={e=>setAssignee(e.target.value)} className='border-input bg-card rounded-md border p-2'><option value=''>Unassigned</option>{staffUsers.map(s=><option value={s.user_id} key={s.user_id}>{s.label}</option>)}</select></label>
   </div>
   <label className='grid gap-1 text-sm'>Resolution summary<textarea rows={3} maxLength={4000} value={summary} onChange={e=>setSummary(e.target.value)} className='border-input bg-card rounded-md border p-3' placeholder='Required to resolve or close' /></label>
   <div><Button disabled={pending} onClick={()=>act(()=>updateSupportTicket(ticket.id,{status,priority,assignedTo:assignee,resolutionSummary:summary}))}>Save changes</Button></div>
  </CardContent></Card>:null}
  <Card><CardHeader><CardTitle>Conversation</CardTitle><CardDescription>Messages are visible to the requester and authorized company users. Internal notes appear only to Forge staff.</CardDescription></CardHeader><CardContent className='grid gap-3'>
   {messages.length?messages.map(m=><div key={m.id} className={'rounded-lg border p-4 '+(m.visibility==='internal'?'bg-muted':'')}>
    <div className='flex flex-wrap justify-between gap-2 text-sm font-semibold'><span>{m.author_kind==='forge'?'Forge Support':'Customer'}{m.visibility==='internal'?' · Internal note':''}</span><time className='text-textSecondary font-normal'>{new Date(m.created_at).toLocaleString()}</time></div>
    <p className='mt-2 whitespace-pre-wrap text-sm'>{m.body}</p>
   </div>):<p className='text-textSecondary text-sm'>No replies yet.</p>}
   {canReply&&!terminal?<form onSubmit={e=>{e.preventDefault();act(async()=>{const result=staff?await staffReplyToSupportTicket(ticket.id,body,internal):await replyToSupportTicket(ticket.id,body);if(!result.error)setBody('');return result})}} className='grid gap-3 pt-3'>
    <label className='grid gap-1 text-sm font-medium'>Reply<textarea required maxLength={10000} value={body} onChange={e=>setBody(e.target.value)} rows={4} className='border-input bg-card rounded-md border p-3' placeholder={internal?'Visible only to Forge staff':'Write a reply'} /></label>
    {staff?<label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={internal} onChange={e=>setInternal(e.target.checked)} />Internal note</label>:null}
    <div><Button type='submit' disabled={pending}>{pending?'Sending…':internal?'Save internal note':'Send reply'}</Button></div>
   </form>:null}
   {!staff&&terminal&&canReply?<div><Button variant='outline' disabled={pending} onClick={()=>act(()=>reopenSupportTicket(ticket.id))}>Reopen request</Button></div>:null}
   {!canReply?<p className='text-textSecondary text-sm'>You can view this request, but only its requester or an authorized company administrator can reply.</p>:null}
   {staff&&terminal?<p className='text-textSecondary text-sm'>Reopen this request through Manage request to reply.</p>:null}
   {error?<p role='alert' className='text-destructive text-sm'>{error}</p>:null}{success?<p role='status' className='text-sm'>{success}</p>:null}
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Attachments</CardTitle><CardDescription>PNG, JPG, WebP, PDF, TXT, or CSV up to 10 MB. Files are private to this request.</CardDescription></CardHeader><CardContent className='grid gap-3'>
   {attachments.length?attachments.map(a=><a key={a.id} href={normalizedBasePath+'/api/support/attachments/'+a.id} className='text-primary break-all underline'>{a.file_name} · {(a.byte_size/1024).toFixed(0)} KB{a.visibility==='internal'?' · Internal':''}</a>):<p className='text-textSecondary text-sm'>No attachments yet.</p>}
   {canReply&&!terminal?<form className='flex flex-wrap items-end gap-3 pt-2' onSubmit={e=>{e.preventDefault();if(!file)return;setError('');setSuccess('');start(async()=>{try{
    const form=new FormData();form.set('file',file);if(privateFile)form.set('visibility','internal')
    const response=await fetch(normalizedBasePath+'/api/support/'+ticket.id+'/attachments',{method:'POST',body:form})
    const result=await response.json()
    if(!response.ok)setError(result.error||'Upload failed.')
    else{setFile(null);setSuccess('Attachment uploaded.');router.refresh()}
   }catch{setError('Upload failed. Try again.')}})}}>
    <label className='grid gap-1 text-sm'>Add file<input type='file' accept='.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv' onChange={e=>setFile(e.target.files?.[0]||null)} /></label>
    {staff?<label className='flex items-center gap-2 text-sm'><input type='checkbox' checked={privateFile} onChange={e=>setPrivateFile(e.target.checked)} />Internal only</label>:null}
    <Button type='submit' variant='outline' disabled={pending||!file}>Upload</Button>
   </form>:null}
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Activity</CardTitle></CardHeader><CardContent className='grid gap-2'>
   {events.length?events.map(ev=><div key={ev.id} className='flex flex-wrap justify-between gap-2 border-b py-2 text-sm'><span>{ev.event_type.replaceAll('_',' ')}{ev.to_value?' → '+ev.to_value.replaceAll('_',' '):''}</span><time className='text-textSecondary'>{new Date(ev.created_at).toLocaleString()}</time></div>):<p className='text-textSecondary text-sm'>No activity yet.</p>}
  </CardContent></Card>
 </div>
}
