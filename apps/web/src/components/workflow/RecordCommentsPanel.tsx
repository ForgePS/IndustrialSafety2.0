import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { addSharedCommentAction } from '@/app/(back)/workflow/actions'

export type SharedCommentItem = {
  id: string
  body: string
  author_user_id?: string | null
  created_at: string
  edited_at?: string | null
}

const RecordCommentsPanel = ({
  resourceType,
  resourceId,
  comments,
  canComment = true
}: {
  resourceType: string
  resourceId: string
  comments: SharedCommentItem[]
  canComment?: boolean
}) => {
  return (
    <Card data-testid='shared-comments'>
      <CardHeader>
        <CardTitle>Shared Comments</CardTitle>
        <CardDescription>Cross-module comments on this record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {comments.length ? (
          comments.map(comment => (
            <div key={comment.id} className='rounded-lg border p-3'>
              <div className='whitespace-pre-wrap text-sm'>{comment.body}</div>
              <div className='text-textSecondary mt-2 text-xs'>
                {new Date(comment.created_at).toLocaleString()}
                {comment.edited_at ? ' · edited' : ''}
              </div>
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No shared comments yet.</div>
        )}

        {canComment ? (
          <form action={addSharedCommentAction} className='flex flex-col gap-2'>
            <input type='hidden' name='resourceType' value={resourceType} />
            <input type='hidden' name='resourceId' value={resourceId} />
            <textarea
              name='body'
              required
              rows={3}
              placeholder='Add a shared comment…'
              className='border-input bg-background rounded-md border px-3 py-2 text-sm'
            />
            <Button type='submit' size='sm' className='w-fit'>
              Add comment
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default RecordCommentsPanel
