// Next Imports
import Link from 'next/link'

// Third-party Imports
import { Badge } from '@repo/ui/components/ui/badge'
import { cn } from '@repo/ui/lib/utils'

// Component Imports
import ReadingTime from './ReadingTime'

// Styles Imports
import frontCommonStyles from '../../styles.module.css'

type Props = {
  postData: {
    title: string | undefined
    description: string | undefined
    featuredImage: string | undefined
    categories: {
      slug: string
      name: string
    }[]
    publishedAt:
      | {
          readonly discriminant: false
          readonly value: null
        }
      | {
          readonly discriminant: true
          readonly value: string
        }
      | undefined
  }
}

const HeaderSection = ({ postData }: Props) => {
  return (
    <section
      id='home'
      className='pbs-16 -mbs-16 relative bg-cover bg-center bg-no-repeat [background-image:url(/images/pages/hero-bg.png)]'
    >
      <div
        className={cn(
          'plb-[60px] min-bs-64 sm:min-bs-[460px] grid grid-cols-1 gap-8 md:grid-cols-2',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='max-md:order- flex flex-col items-start justify-center gap-6'>
          <div className='max-is-full flex items-center gap-2 overflow-x-auto'>
            {[...new Set(postData?.categories)]?.map((category, index) => (
              <Link key={index} href={`/blog?category=${category.slug}`}>
                <Badge key={index} variant='tonalPrimary' size='md'>
                  {category.name}
                </Badge>
              </Link>
            ))}
          </div>
          <h1 className='max-is-[657px] text-2xl font-bold sm:text-3xl sm:leading-[1.4]'>{postData?.title}</h1>
          <p className='text-textPrimary line-clamp-3 text-base'>{postData?.description}</p>
          <p className='text-textSecondary text-sm'>
            {`${
              postData.publishedAt?.discriminant &&
              new Date(postData.publishedAt.value).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            }
            • `}
            <ReadingTime /> read
          </p>
        </div>
        <div className='flex items-center'>
          <img src={postData?.featuredImage} alt={postData?.title} className='is-full aspect-video rounded-xl' />
        </div>
      </div>
    </section>
  )
}

export default HeaderSection
