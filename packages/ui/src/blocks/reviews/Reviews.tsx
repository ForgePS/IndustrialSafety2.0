// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbCircleCheckFilled, TbMapPin } from 'react-icons/tb'

// Type Imports
import type { Database } from '@repo/supabase/types'

// Component Imports
import { Avatar, AvatarFallback, AvatarImage } from '@repo/ui/components/ui/avatar'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardHeader } from '@repo/ui/components/ui/card'
import { Ratings } from '@repo/ui/components/ui/ratings'
import { MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import BlurFade from '@repo/ui/components/ui/blur-fade'

// Util Imports
import { cn } from '@repo/ui/lib/utils'
import { getInitials } from '@repo/ui/utils/getInitials'

type ReviewType = Database['public']['Tables']['reviews']['Row']

type Props = {
  data: ReviewType[]
  columnCount?: number
  columnWidth?: number
  gap?: number
  className?: string
  transitionDelay?: number
  transitionDuration?: number
}

type PlatformLogoType = {
  [key: string]: string
}

const platformLogos: PlatformLogoType = {
  trustpilot: '/images/logos/trustpilot.png',
  twitter: '/images/logos/twitter.png',
  g2: '/images/logos/g2.png'
}

// To get the first name and the first letter of the last name
const name = (name: string) => {
  const [firstName, lastName] = name.split(' ')

  return `${firstName} ${lastName ? lastName.charAt(0).toUpperCase() + '.' : ''}`
}

const Reviews = (props: Props) => {
  // Props
  const {
    data,
    columnCount = 4,
    columnWidth = 300,
    gap = 24,
    className,
    transitionDelay = 0.2,
    transitionDuration = 0.4
  } = props

  return (
    <>
      {data.length === 0 ? (
        <div className={cn('flex flex-col items-center justify-center gap-y-2 text-center', className)}>
          <MotionFadeElement
            component='h1'
            variants={{
              hidden: { y: 30 },
              show: { transition: { delay: transitionDelay, duration: transitionDuration }, y: 0 }
            }}
            className='text-textPrimary text-2xl font-medium'
          >
            No Reviews Available
          </MotionFadeElement>
          <MotionFadeElement
            component='p'
            variants={{
              hidden: { y: 30 },
              show: {
                transition: { delay: transitionDelay + (transitionDuration - 0.1), duration: transitionDuration },
                y: 0
              }
            }}
            className='text-textSecondary'
          >
            There are no reviews for this product yet. Be the first to share your feedback!
          </MotionFadeElement>
        </div>
      ) : (
        <div
          style={{ columnCount: columnCount, columnWidth: `${columnWidth}px`, gap: `${gap}px` }}
          className={className}
        >
          {data.map((review: ReviewType, index) => (
            <BlurFade key={index} delay={transitionDelay + index * 0.05} duration={transitionDuration} inView>
              <Link href={review.link ? review.link : ''} target='_blank'>
                <Card
                  style={{ marginBlockEnd: `${gap}px` }}
                  className='break-inside-avoid-column border shadow-none transition duration-200 hover:scale-[1.02]'
                >
                  <CardHeader className='pbe-4 flex items-center gap-4'>
                    <div className='is-full flex justify-start gap-3'>
                      <Avatar shape='circle' size='3xl' color='primary'>
                        <AvatarImage src={review.avatarImage ?? ''} alt={review.username} />
                        <AvatarFallback className='text-xl'>
                          {getInitials(review.username).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className='flex flex-col items-start gap-y-2'>
                        <div className='flex flex-wrap items-center justify-between gap-1.5'>
                          <h1 className='max-is-[177px] truncate text-lg font-semibold capitalize'>
                            {name(review.username)}
                          </h1>
                          {review.designation && (
                            <span className='text-textSecondary text-sm'>({review.designation})</span>
                          )}
                        </div>
                        <div className='flex flex-wrap items-center justify-between gap-1.5'>
                          <Badge variant='tonalSuccess' size='sm' shape='circle'>
                            <TbCircleCheckFilled className='text-xl' />
                            <span>Verified User</span>
                          </Badge>
                          {review.country && (
                            <span className='text-textSecondary text-sm capitalize [display:ruby]'>
                              <TbMapPin className='text-textSecondary mie-0.5 align-text-top text-base' />
                              {review.country}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className='is-full flex items-center justify-start'>
                      <Ratings rating={review.rating} className='[&>svg]:bs-[22px] [&>svg]:is-[22px]' disabled />
                      <hr className='border-border mlb-0 bs-auto is-4 rotate-90 flex-col' />
                      <div className='flex items-center gap-1'>
                        <img
                          src={platformLogos[review.platform.toLowerCase()]}
                          alt={review.platform}
                          className='is-4 bs-auto'
                        />
                        <p className='text-textPrimary text-sm font-medium capitalize'>{review.platform}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {review.title && <h1 className='mbe-1 text-lg font-semibold'>{review.title}</h1>}
                    <p className='text-textSecondary text-base'>{review.content}</p>
                    {review.videoUrl && (
                      <iframe
                        width='100%'
                        className='mbs-4 rounded-lg'
                        src={review.videoUrl}
                        title='YouTube video player'
                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                      />
                    )}
                  </CardContent>
                </Card>
              </Link>
            </BlurFade>
          ))}
        </div>
      )}
    </>
  )
}

export default Reviews
