import { Skeleton } from '@repo/ui/components/ui/skeleton'

/**
 * Shown as soon as a link is clicked, while the next page loads on the server. Without it, App Router
 * keeps the old page on screen with no feedback, so a slow page looks like a click that did nothing.
 */
const BackLoading = () => (
  <div className='flex min-w-0 flex-col gap-6' role='status' aria-live='polite' aria-label='Loading page' data-testid='page-loading'>
    <span className='sr-only'>Loading...</span>
    <div className='flex flex-col gap-2'>
      <Skeleton className='h-4 w-48' />
      <Skeleton className='h-8 w-72' />
      <Skeleton className='h-4 w-96 max-w-full' />
    </div>
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {[0, 1, 2, 3].map(key => (
        <Skeleton key={key} className='h-24' />
      ))}
    </div>
    <Skeleton className='h-80' />
  </div>
)

export default BackLoading
