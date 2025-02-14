'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbEdit } from 'react-icons/tb'
import { removeImageFromSupabase } from '@repo/supabase/clientHelpers'
import type { Row, ColumnDef } from '@tanstack/react-table'
import { Card } from '@repo/ui/components/ui/card'
import { Button } from '@repo/ui/components/ui/button'
import { Switch } from '@repo/ui/components/ui/switch'
import { Ratings } from '@repo/ui/components/ui/ratings'
import DataTable from '@repo/ui/components/ui/data-table'
import DeleteDialog from '@repo/ui/components/DeleteDialog'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import { hasAnyPermission, hasPermission } from '@repo/rbac/utils'
import type { TFunction } from 'i18next'
import type { Database } from '@repo/supabase/types'

export type ReviewsWithPlatforms = Database['public']['Tables']['reviews']['Row'] & {
  review_platforms?: {
    platform_name: string
  }
}

// Delete a review
export const deleteReview = async (reviewId: number, reviewUrl: string | null, t: TFunction) => {
  // Vars
  const supabase = createClient()

  try {
    const { error } = await supabase.from('reviews').delete().eq('id', reviewId)

    if (reviewUrl) {
      await removeImageFromSupabase(reviewUrl)
    }

    if (error) {
      console.error('Error deleting review: ', error.message)
      toast('error', t('admin:reviewsDeleteError', { message: error.message }))
    } else {
      toast('success', t('admin:reviewsDeleteSuccess'))
    }
  } catch (error) {
    console.error('Error deleting review: ', error)

    return false
  }
}

// Switch component for toggling isFeatured
const SwitchState = ({ row }: { row: Row<Database['public']['Tables']['reviews']['Row']> }) => {
  // States
  const [isFeatured, setIsFeatured] = useState(row.original.is_featured)

  // Vars
  const supabase = createClient()

  const handleToggle = async (checked: boolean) => {
    // Optimistically update the state
    setIsFeatured(checked)

    // Perform the API update
    const { error } = await supabase.from('reviews').update({ is_featured: checked }).eq('id', row.original.id)

    if (error) {
      console.error('Error updating review: ', error.message)

      // Revert back the state
      setIsFeatured(!checked)
    }
  }

  return <Switch checked={isFeatured} onCheckedChange={handleToggle} />
}

const Reviews = ({
  reviewData,
  userPermissions
}: {
  reviewData: ReviewsWithPlatforms[]
  userPermissions: string[]
}) => {
  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  const columns: ColumnDef<ReviewsWithPlatforms>[] = [
    {
      accessorKey: 'username',
      header: () => <Trans i18nKey='admin:reviewsUsernameColumn' />,
      cell: ({ row }) => <div className='capitalize'>{row.getValue('username')}</div>
    },
    {
      accessorKey: 'rating',
      header: () => <Trans i18nKey='admin:ratingsLabel' />,
      cell: ({ row }) => <Ratings rating={row.original.rating || 5} disabled />
    },
    {
      accessorKey: 'platform',
      header: () => <Trans i18nKey='admin:reviewsPlatformColumn' />,
      cell: ({ row }) => <div className='capitalize'>{row.original.review_platforms?.platform_name || '-'}</div>
    },
    {
      accessorKey: 'is_featured',
      header: () => <Trans i18nKey='admin:isFeaturedLabel' />,
      cell: ({ row }) => <SwitchState row={row} />
    },
    ...(hasAnyPermission(userPermissions, ['update_reviews', 'delete_reviews'])
      ? [
          {
            id: 'actions',
            header: () => <Trans i18nKey='admin:actionsColumn' />,
            enableHiding: false,
            cell: ({ row }: { row: Row<Database['public']['Tables']['reviews']['Row']> }) => (
              <div className='flex items-center gap-4'>
                {hasPermission(userPermissions, 'update_reviews') && (
                  <Link
                    href={`/admin/reviews/review/${row.original.id}/edit`}
                    className='text-primary flex items-center gap-1'
                  >
                    <TbEdit />
                    <Trans i18nKey='admin:editButton' />
                  </Link>
                )}
                {hasPermission(userPermissions, 'delete_reviews') && (
                  <DeleteDialog
                    variant='ghostDestructive'
                    handleDelete={async () => {
                      await deleteReview(row.original.id, row.original.review_url, t)
                      router.refresh()
                    }}
                    itemName='review'
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
          <Trans i18nKey='admin:reviewsTitle' />
        </h1>
        {hasPermission(userPermissions, 'create_reviews') && (
          <Link href='/admin/reviews/review/create'>
            <Button className='max-sm:is-full'>
              <Trans i18nKey='admin:reviewsNewButton' />
            </Button>
          </Link>
        )}
      </div>
      <Card>
        <DataTable data={reviewData} columns={columns} search={{ enabled: true }} />
      </Card>
    </div>
  )
}

export default Reviews
