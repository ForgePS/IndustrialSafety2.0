'use client'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import * as Icons from 'react-icons/tb'
import DataTable from '@repo/ui/components/ui/data-table'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { hasAnyPermission } from '@repo/rbac/utils'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ColumnDef, Row } from '@tanstack/react-table'
import type { Database } from '@repo/supabase/types'

export type CategoryTypes = Omit<Database['public']['Tables']['faq_categories']['Row'], 'icon'> & {
  icon: keyof typeof Icons
}

// To render dynamic icons
const DynamicIcon = (icon: keyof typeof Icons) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className='bs-6 is-6' />
}

export const handleDelete = async (categoryId: number, t: TFunction) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('faq_categories').delete().eq('id', categoryId)

    if (error) {
      console.error('Error deleting category: ', error.message)
      toast('error', t('admin:faqCategoriesDeleteError', { message: error.message }))
    } else {
      toast('success', t('admin:faqCategoriesDeleteSuccess'))
    }
  } catch (error: any) {
    console.error('Error deleting category: ', error)
    toast('error', t('admin:faqCategoriesDeleteError', { message: error.message }))
  }
}

const Categories = ({
  categoryData,
  userPermissions
}: {
  categoryData: CategoryTypes[]
  userPermissions: string[]
}) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Handle Delete

  const columns: ColumnDef<CategoryTypes>[] = [
    {
      accessorKey: 'title',
      header: () => <Trans i18nKey='admin:categoryLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('title')}</div>
    },
    {
      accessorKey: 'icon',
      header: () => <Trans i18nKey='admin:faqCategoriesIconColumn' />,
      cell: ({ row }) => (
        <Avatar color='primary' shape='rounded' className='bs-[38px] is-[38px]'>
          <AvatarFallback>{row.original.icon ? DynamicIcon(row.original.icon) : null}</AvatarFallback>
        </Avatar>
      )
    },
    ...(hasAnyPermission(userPermissions, ['update_faqs', 'delete_faqs'])
      ? [
          {
            id: 'actions',
            header: () => <Trans i18nKey='admin:actionsColumn' />,
            enableHiding: false,
            cell: ({ row }: { row: Row<CategoryTypes> }) => (
              <div className='flex items-center gap-4'>
                {hasAnyPermission(userPermissions, ['update_faqs']) && (
                  <Link
                    href={`/admin/faqs/category/${row.original.id}/edit`}
                    className='text-primary flex items-center gap-1'
                  >
                    <TbEdit />
                    <Trans i18nKey='admin:editButton' />
                  </Link>
                )}
                {hasAnyPermission(userPermissions, ['delete_faqs']) && (
                  <DeleteDialog
                    variant='ghostDestructive'
                    handleDelete={async () => {
                      await handleDelete(row.original.id, t)
                      router.refresh()
                    }}
                    itemName='category'
                  />
                )}
              </div>
            )
          }
        ]
      : [])
  ]

  return (
    <div className='grid grid-cols-1 gap-y-8'>
      <div className='flex flex-wrap gap-4 max-sm:flex-col sm:items-center sm:justify-between'>
        <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
          <Trans i18nKey='admin:faqCategoriesTitle' />
        </h1>
        {hasAnyPermission(userPermissions, ['create_faqs']) && (
          <Button className='max-sm:is-full' asChild>
            <Link href='/admin/faqs/category/create'>
              <Trans i18nKey='admin:faqCategoriesNewButton' />
            </Link>
          </Button>
        )}
      </div>
      <Card>
        <DataTable data={categoryData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Categories
