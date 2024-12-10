'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import type { ColumnDef, Row } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Switch } from '@repo/ui/components/ui/switch'
import DataTable from '@repo/ui/components/ui/data-table'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import type { Database } from '@repo/supabase/types'

export type FaqWithCategory = Database['public']['Tables']['faqs']['Row'] & {
  faq_categories: {
    title: string | null
  }
}

// Delete a faq
export const deleteFaq = async (faqId: number) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('faqs').delete().eq('id', faqId)

    if (error) {
      console.error('Error deleting faq: ', error.message)
      toast('error', 'Error deleting faq: ' + error.message)
    } else {
      toast('success', 'Faq deleted successfully')
    }
  } catch (error) {
    console.error('Error deleting faq: ', error)

    return false
  }
}

// SwitchState component to handle toggling isFeatured
const SwitchState = ({ row }: { row: Row<FaqWithCategory> }) => {
  // Vars
  const supabase = createClient()

  // States
  const [isFeatured, setIsFeatured] = useState(row.original.isFeatured)

  const handleToggle = async (checked: boolean) => {
    // Optimistically update the state
    setIsFeatured(checked)

    // Update isFeatured in Supabase
    const { error } = await supabase.from('faqs').update({ isFeatured: checked }).eq('id', row.original.id)

    // Handle update error
    if (error) {
      console.error('Error updating FAQ featured status: ', error.message)
      toast('error', 'Error updating FAQ featured status: ' + error.message)

      setIsFeatured(!checked)
    }
  }

  return <Switch size='sm' checked={isFeatured} onCheckedChange={handleToggle} />
}

const Faq = ({ faqData }: { faqData: FaqWithCategory[] }) => {
  // Hooks
  const router = useRouter()

  const columns: ColumnDef<FaqWithCategory>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('title')}</div>
    },
    {
      accessorKey: 'categories.title',
      header: 'Category',
      cell: ({ row }) => <div className='capitalize'>{row.original.faq_categories?.title || '-'}</div>
    },
    {
      accessorKey: 'isFeatured',
      header: 'Is Featured',
      cell: ({ row }) => <SwitchState row={row} />
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link href={`/admin/faqs/faq/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            Edit
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await deleteFaq(row.original.id)
              router.refresh()
            }}
          />
        </div>
      )
    }
  ]

  return (
    <div className='flex flex-col gap-y-8'>
      <div className='flex gap-y-2 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-3xl font-bold'>FAQs</h1>
        <Link href='/admin/faqs/faq/create'>
          <Button className='max-sm:is-full'>Add New FAQ</Button>
        </Link>
      </div>
      <Card>
        <DataTable data={faqData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Faq
