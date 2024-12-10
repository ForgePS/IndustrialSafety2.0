'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import * as Icons from 'react-icons/tb'
import type { ColumnDef } from '@tanstack/react-table'
import DataTable from '@repo/ui/components/ui/data-table'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import type { Database } from '@repo/supabase/types'

export type CategoryTypes = Omit<Database['public']['Tables']['faq_categories']['Row'], 'icon'> & {
  icon: keyof typeof Icons
}

// To render dynamic icons
export const DynamicIcon = (icon: keyof typeof Icons) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className='bs-6 is-6' />
}

export const handleDelete = async (categoryId: number) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('faq_categories').delete().eq('id', categoryId)

    if (error) {
      console.error('Error deleting category: ', error.message)
      toast('error', 'Error deleting category: ' + error.message)
    } else {
      toast('success', 'Category deleted successfully')
    }
  } catch (error) {
    console.error('Error deleting category: ', error)
  }
}

const Categories = ({ categoryData }: { categoryData: CategoryTypes[] }) => {
  // Hooks
  const router = useRouter()

  const columns: ColumnDef<CategoryTypes>[] = [
    {
      accessorKey: 'title',
      header: 'Category',
      cell: ({ row }) => <div className='capitalize'>{row.getValue('title')}</div>
    },
    {
      accessorKey: 'icon',
      header: 'Icon',
      cell: ({ row }) => (
        <Avatar color='primary' shape='rounded' className='bs-[38px] is-[38px]'>
          <AvatarFallback>{row.original.icon ? DynamicIcon(row.original.icon) : null}</AvatarFallback>
        </Avatar>
      )
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-4'>
          <Link href={`/admin/faqs/category/${row.original.id}/edit`} className='text-primary flex items-center gap-1'>
            <TbEdit />
            Edit
          </Link>
          <DeleteDialog
            variant='ghostDestructive'
            handleDelete={async () => {
              await handleDelete(row.original.id)
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
        <h1 className='text-textPrimary text-3xl font-bold'>FAQs Categories</h1>
        <Link href='/admin/faqs/category/create'>
          <Button className='max-sm:is-full'>Add New Category</Button>
        </Link>
      </div>
      <Card>
        <DataTable data={categoryData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Categories
