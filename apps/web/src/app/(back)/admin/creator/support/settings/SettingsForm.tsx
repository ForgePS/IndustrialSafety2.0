'use client'
import { useState,useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@repo/ui/components/ui/button'
import { Card,CardContent,CardHeader,CardTitle,CardDescription } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { updateSupportSla } from './actions'
export default function SettingsForm({policies}:{policies:{priority:string;first_response_hours:number;resolution_hours:number}[]}){
 const [items,setItems]=useState(policies)
 const [message,setMessage]=useState('')
 const [pending,start]=useTransition()
 return <div className='grid gap-6'>
  <div><Link href='/admin/creator/support' className='text-primary text-sm'>← Support queue</Link><h1 className='mt-3 text-3xl font-bold'>Support response targets</h1><p className='text-textSecondary mt-2'>Targets use elapsed hours. Changes apply to new requests; existing targets remain as recorded.</p></div>
  <Card><CardHeader><CardTitle>Priority targets</CardTitle><CardDescription>Set the first response and resolution goal for each priority.</CardDescription></CardHeader><CardContent className='grid gap-4'>
  {items.map((item,index)=><div key={item.priority} className='grid items-end gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_160px_160px_auto]'>
   <div className='font-semibold capitalize'>{item.priority}</div>
   <label className='grid gap-1 text-sm'>First response (hours)<Input type='number' min={1} max={720} value={item.first_response_hours} onChange={e=>setItems(items.map((v,i)=>i===index?{...v,first_response_hours:Number(e.target.value)}:v))} /></label>
   <label className='grid gap-1 text-sm'>Resolution (hours)<Input type='number' min={1} max={2160} value={item.resolution_hours} onChange={e=>setItems(items.map((v,i)=>i===index?{...v,resolution_hours:Number(e.target.value)}:v))} /></label>
   <Button disabled={pending} onClick={()=>{setMessage('');start(async()=>{const result=await updateSupportSla({priority:item.priority,firstResponseHours:item.first_response_hours,resolutionHours:item.resolution_hours});setMessage(result.error||result.message||'Saved.')})}}>Save</Button>
  </div>)}
  {message?<p role='status' className='text-sm'>{message}</p>:null}
  </CardContent></Card>
 </div>
}
