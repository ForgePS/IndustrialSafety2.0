'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbHeadset, TbPlus, TbSearch } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Badge } from '@repo/ui/components/ui/badge'
import { createSupportTicket } from './actions'

export type SupportItem = {
 id:string; ticket_number:string; subject:string; category:string; priority:string; status:string;
 created_at:string; updated_at:string; first_response_due_at:string|null; resolution_due_at:string|null;
 organizationName?:string; requesterName?:string
}
const labels:Record<string,string>={new:'New',triaged:'Triaged',in_progress:'In progress',waiting_on_customer:'Waiting on customer',waiting_on_forge:'Waiting on Forge',resolved:'Resolved',closed:'Closed',feature_request:'Feature request'}
export default function SupportDesk({tickets,canCreate=false,staff=false,canSettings=false}:{tickets:SupportItem[];canCreate?:boolean;staff?:boolean;canSettings?:boolean}) {
 const router=useRouter()
 const [search,setSearch]=useState('')
 const [filter,setFilter]=useState('active')
 const [showForm,setShowForm]=useState(false)
 const [error,setError]=useState('')
 const [pending,start]=useTransition()
 const visible=useMemo(()=>tickets.filter(ticket=>{
   const q=search.toLowerCase()
   return (!q || [ticket.ticket_number,ticket.subject,ticket.organizationName||''].some(v=>v.toLowerCase().includes(q))) &&
     (filter==='all'||(filter==='active'?!['resolved','closed'].includes(ticket.status):ticket.status===filter))
 }),[tickets,search,filter])
 const base=staff?'/admin/creator/support':'/support'
 const overdue=tickets.filter(t=>!['resolved','closed'].includes(t.status)&&t.first_response_due_at&&new Date(t.first_response_due_at)<new Date()).length
 return <div className='flex flex-col gap-6'>
  <div className='flex flex-wrap items-start justify-between gap-4'>
   <div><h1 className='flex items-center gap-3 text-3xl font-bold'><TbHeadset />{staff?'Forge Support Queue':'Customer Support'}</h1>
    <p className='text-textSecondary mt-2'>{staff?'Requests across Forge Industrial Safety tenants.':'Contact Forge, follow replies, and track resolution.'}</p></div>
   <div className='flex gap-2'>{canSettings?<Button variant='outline' asChild><Link href='/admin/creator/support/settings'>Response targets</Link></Button>:null}{canCreate?<Button onClick={()=>setShowForm(!showForm)}><TbPlus />New request</Button>:null}</div>
  </div>
  <div className='grid gap-3 sm:grid-cols-3'>
   <Card><CardContent className='p-4'><div className='text-textSecondary text-sm'>Active</div><div className='text-2xl font-bold'>{tickets.filter(t=>!['resolved','closed'].includes(t.status)).length}</div></CardContent></Card>
   <Card><CardContent className='p-4'><div className='text-textSecondary text-sm'>Waiting on Forge</div><div className='text-2xl font-bold'>{tickets.filter(t=>['new','triaged','in_progress','waiting_on_forge'].includes(t.status)).length}</div></CardContent></Card>
   <Card><CardContent className='p-4'><div className='text-textSecondary text-sm'>First response overdue</div><div className='text-2xl font-bold'>{overdue}</div></CardContent></Card>
  </div>
  {showForm?<Card><CardHeader><CardTitle>New support request</CardTitle><CardDescription>Include what you were doing, what happened, and what you expected.</CardDescription></CardHeader>
   <CardContent><form className='grid gap-4' onSubmit={e=>{
     e.preventDefault();setError('');const form=new FormData(e.currentTarget)
     start(async()=>{const result=await createSupportTicket(form);if(result.error)setError(result.error);else if(result.id)router.push('/support/'+result.id)})
   }}>
    <label className='grid gap-1 text-sm font-medium'>Subject<Input name='subject' minLength={4} maxLength={160} required placeholder='Briefly describe the issue' /></label>
    <div className='grid gap-4 sm:grid-cols-2'>
     <label className='grid gap-1 text-sm font-medium'>Category<select name='category' className='border-input bg-card rounded-md border p-2'>{['general','account','access','billing','bug','feature_request','data','integration','training','incident'].map(x=><option key={x} value={x}>{labels[x]||x.replaceAll('_',' ')}</option>)}</select></label>
     <label className='grid gap-1 text-sm font-medium'>Priority<select name='priority' defaultValue='normal' className='border-input bg-card rounded-md border p-2'>{['low','normal','high','urgent'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    </div>
    <label className='grid gap-1 text-sm font-medium'>Description<textarea name='description' required minLength={10} maxLength={10000} rows={6} className='border-input bg-card rounded-md border p-3' placeholder='Steps to reproduce, impact, and expected behavior' /></label>
    <div className='grid gap-4 sm:grid-cols-3'>
     <label className='grid gap-1 text-sm font-medium'>Product area<Input name='product_area' maxLength={100} placeholder='e.g. Inspections' /></label>
     <label className='grid gap-1 text-sm font-medium'>Page URL<Input name='page_url' maxLength={500} placeholder='Optional page' /></label>
     <label className='grid gap-1 text-sm font-medium'>Device / browser<Input name='environment' maxLength={100} placeholder='Optional' /></label>
    </div>
    {error?<p role='alert' className='text-destructive text-sm'>{error}</p>:null}
    <div className='flex gap-3'><Button disabled={pending} type='submit'>{pending?'Creating…':'Submit request'}</Button><Button type='button' variant='outline' onClick={()=>setShowForm(false)}>Cancel</Button></div>
   </form></CardContent></Card>:null}
  <Card><CardContent className='grid gap-3 p-4 sm:grid-cols-[1fr_220px]'>
   <div className='relative'><TbSearch className='text-textSecondary absolute left-3 top-3' /><Input value={search} onChange={e=>setSearch(e.target.value)} className='pl-10' placeholder='Search number, subject or company' /></div>
   <select value={filter} onChange={e=>setFilter(e.target.value)} className='border-input bg-card rounded-md border px-3'><option value='active'>Active</option><option value='all'>All</option>{['new','triaged','in_progress','waiting_on_customer','waiting_on_forge','resolved','closed'].map(x=><option value={x} key={x}>{labels[x]}</option>)}</select>
  </CardContent></Card>
  <div className='grid gap-3'>{visible.length?visible.map(t=><Link href={base+'/'+t.id} key={t.id} className='rounded-lg border bg-card p-4 transition-colors hover:border-primary'>
   <div className='flex flex-wrap justify-between gap-2'><div><span className='text-textSecondary text-xs'>{t.ticket_number} {t.organizationName?'· '+t.organizationName:''}</span><h2 className='font-semibold'>{t.subject}</h2></div><div className='flex gap-2'><Badge size='sm' variant={t.priority==='urgent'?'destructive':'outline'}>{t.priority}</Badge><Badge size='sm' variant={t.status==='resolved'?'tonalSuccess':'outline'}>{labels[t.status]||t.status}</Badge></div></div>
   <p className='text-textSecondary mt-2 text-sm'>Updated {new Date(t.updated_at).toLocaleString()}{t.requesterName?' · '+t.requesterName:''}</p>
  </Link>):<Card><CardContent className='p-8 text-center text-textSecondary'>No requests match these filters.</CardContent></Card>}</div>
  {tickets.length>=100?<p className='text-textSecondary text-sm'>Showing the 100 most recently updated requests.</p>:null}
 </div>
}
