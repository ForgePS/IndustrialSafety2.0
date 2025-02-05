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
import Trans from '@repo/i18n/Trans'
import { hasAnyPermission, hasPermission } from '@repo/rbac/utils'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

export type FaqWithCategory = Database['public']['Tables']['faqs']['Row'] & {
  faq_categories: {
    title: string | null
  }
}

// Delete a faq
export const deleteFaq = async (faqId: number, t: TFunction) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('faqs').delete().eq('id', faqId)

    if (error) {
      console.error('Error deleting faq: ', error.message)
      toast('error', t('admin:faqsDeleteError', { message: error.message }))
    } else {
      toast('success', t('admin:faqsDeleteSuccess'))
    }
  } catch (error: any) {
    console.error('Error deleting faq: ', error)
    toast('error', t('admin:faqsDeleteError', { message: error.message }))

    return false
  }
}

// SwitchState component to handle toggling isFeatured
const SwitchState = ({ row }: { row: Row<FaqWithCategory> }) => {
  // Vars
  const supabase = createClient()

  // States
  const [isFeatured, setIsFeatured] = useState(row.original.is_featured)

  // Hooks
  const { t } = useTranslation()

  const handleToggle = async (checked: boolean) => {
    // Optimistically update the state
    setIsFeatured(checked)

    // Update isFeatured in Supabase
    const { error } = await supabase.from('faqs').update({ is_featured: checked }).eq('id', row.original.id)

    // Handle update error
    if (error) {
      console.error('Error updating FAQ featured status: ', error.message)
      toast('error', t('admin:faqsUpdateFeaturedError', { message: error.message }))

      setIsFeatured(!checked)
    }
  }

  return <Switch size='sm' checked={isFeatured} onCheckedChange={handleToggle} />
}

const Faq = ({ faqData, userPermissions }: { faqData: FaqWithCategory[]; userPermissions: string[] }) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const columns: ColumnDef<FaqWithCategory>[] = [
    {
      accessorKey: 'title',
      header: () => <Trans i18nKey='admin:titleLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('title')}</div>
    },
    {
      id: 'faqCategory',
      header: () => <Trans i18nKey='admin:categoryLabel' />,
      cell: ({ row }) => <div className='capitalize'>{row.original.faq_categories?.title || '-'}</div>
    },
    {
      accessorKey: 'is_featured',
      header: () => <Trans i18nKey='admin:isFeaturedLabel' />,
      cell: ({ row }) => <SwitchState row={row} />
    },
    ...(hasAnyPermission(userPermissions, ['update_faqs', 'delete_faqs'])
      ? [
          {
            id: 'actions',
            header: () => <Trans i18nKey='admin:actionsColumn' />,
            enableHiding: false,
            cell: ({ row }: { row: Row<FaqWithCategory> }) => (
              <div className='flex items-center gap-4'>
                {hasPermission(userPermissions, 'update_faqs') && (
                  <Link
                    href={`/admin/faqs/faq/${row.original.id}/edit`}
                    className='text-primary flex items-center gap-1'
                  >
                    <TbEdit />
                    <Trans i18nKey='admin:editButton' />
                  </Link>
                )}
                {hasPermission(userPermissions, 'delete_faqs') && (
                  <DeleteDialog
                    variant='ghostDestructive'
                    handleDelete={async () => {
                      await deleteFaq(row.original.id, t)
                      router.refresh()
                    }}
                    itemName='FAQ'
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
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <h1 className='text-textPrimary text-3xl font-bold'>
          <Trans i18nKey='admin:faqsTitle' />
        </h1>
        {hasPermission(userPermissions, 'create_faqs') && (
          <Link href='/admin/faqs/faq/create'>
            <Button className='max-sm:is-full'>
              <Trans i18nKey='admin:faqsNewButton' />
            </Button>
          </Link>
        )}
      </div>
      <Card>
        <DataTable data={faqData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Faq
