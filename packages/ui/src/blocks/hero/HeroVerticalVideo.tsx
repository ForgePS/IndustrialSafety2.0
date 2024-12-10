// Third-party Imports
import { TbRocket } from 'react-icons/tb'

// Components Imports
import { Ratings } from '@repo/ui/components/ui/ratings'
import { MotionElement, MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import AvatarGroup from '@repo/ui/components/ui/avatar-group'
import RainbowButton from '@repo/ui/components/ui/rainbow-button'
import VideoDialog from '@repo/ui/components/ui/video-dialog'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'

// Vars
const avatarUrls = ['/images/avatars/1.png', '/images/avatars/2.png', '/images/avatars/3.png', '/images/avatars/4.png']

const HeroVerticalVideo = () => {
  return (
    <section className='p-4 sm:p-6 md:p-8'>
      <div className='bg-primary/[0.08] pbs-10 sm:pbs-16 lg:pbs-24 rounded-3xl'>
        <div className={cn('flex flex-col gap-6 sm:gap-10 md:gap-14', frontCommonStyles.layoutSpacing)}>
          <div>
            <div className='flex flex-col items-center gap-5 text-center'>
              <MotionFadeElement
                component='div'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
                }}
                className='relative inline-block'
              >
                <h1 className='text-textPrimary text-3xl font-bold sm:text-4xl md:text-5xl md:leading-[1.2]'>
                  <span className='from-primary to-destructive relative bg-gradient-to-r bg-clip-text [-webkit-text-fill-color:transparent]'>
                    Effortless SaaS
                    <img
                      src='/images/blocks/hero/underline-background.png'
                      className='block-end-0 max-is-[4.65rem] sm:max-is-[5.6rem] md:max-is-[7.5rem] absolute end-0'
                    />
                  </span>{' '}
                  🚀
                  <br />
                  Launch Like a Pro in Days
                </h1>
              </MotionFadeElement>
              <MotionFadeElement
                component='p'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.5, duration: 0.4 }, y: 0 }
                }}
                className='text-textSecondary sm:is-5/6 md:is-1/2 xl:is-1/3 text-lg font-semibold sm:text-xl sm:leading-[1.4]'
              >
                Ship Faster and Focus on Growth with the
                <br />
                All-In-One{' '}
                <span className='text-primary relative'>
                  Tech Stack
                  <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r font-bold' />
                </span>{' '}
                Boilerplate.
              </MotionFadeElement>
              <MotionFadeElement
                component='div'
                variants={{
                  hidden: { y: 30 },
                  show: { transition: { delay: 0.8, duration: 0.4 }, y: 0 }
                }}
                className='flex items-center gap-3'
              >
                <AvatarGroup size='3xl' limit={4} avatarUrls={avatarUrls} />
                <div className='flex flex-col items-start gap-1'>
                  <p className='text-textPrimary text-sm leading-4'>Loved by great clients</p>
                  <Ratings rating={5} disabled />
                </div>
              </MotionFadeElement>
            </div>
            <MotionFadeElement
              component='div'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 1.1, duration: 0.4 }, y: 0 }
              }}
              className='mbs-8 sm:mbs-12 flex max-sm:flex-col sm:justify-center'
            >
              <RainbowButton size='lg' className='!plb-2.5'>
                Get Started Now
                <TbRocket className='text-xl' />
              </RainbowButton>
            </MotionFadeElement>
          </div>
          <MotionElement
            component='div'
            initial='hidden'
            whileInView='show'
            viewport={{ once: true }}
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { delay: 1.4, duration: 0.4 } }
            }}
            className='relative inline-block'
          >
            <VideoDialog
              videoSrc='https://www.youtube.com/embed/BR24NBgHecQ'
              thumbnailSrcLight='/images/blocks/hero/hero-dashboard-v3-light.png'
              thumbnailSrcDark='/images/blocks/hero/hero-dashboard-v3-dark.png'
              thumbnailAlt='Hero Video'
              className='mli-auto md:is-4/5 lg:is-3/4'
            />
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [0, -15],
                rotate: [0, -20],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2.3
                  },
                  rotate: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2.3
                  }
                }
              }}
              className='inline-start-10 block-start-12 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/nextjs.png'
                height={42}
                width={42}
                alt='nextjs icon'
                id='nextjs-icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [-10, 10],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 4
                  }
                }
              }}
              className='inline-start-28 block-start-1/2 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/lemon-squeezy.png'
                height={38}
                width={38}
                alt='lemonsqueezy icon'
                id='lemonsqueezy-icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [-5, 10],
                rotate: [0, 20],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2
                  },
                  rotate: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2
                  }
                }
              }}
              className='inline-start-20 block-end-4 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/stripe.png'
                height={42}
                width={42}
                alt='stripe icon'
                id='stripe-icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [-7, 7],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2.2
                  }
                }
              }}
              className='inline-end-12 block-start-4 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/shadcn.png'
                height={42}
                width={42}
                alt='shadcn icon'
                id='shadcn-icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [-5, 10],
                rotate: [0, 20],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2
                  },
                  rotate: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2
                  }
                }
              }}
              className='inline-end-24 block-start-1/2 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/supabase.png'
                height={38}
                width={38}
                alt='supabase icon'
                id='supabase-icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [10, -5],
                transition: {
                  y: {
                    repeat: Infinity,
                    repeatType: 'mirror',
                    duration: 2
                  }
                }
              }}
              className='inline-end-20 block-end-4 absolute max-lg:hidden'
            >
              <img
                className='rounded-full'
                src='/images/logos/auth.png'
                height={32}
                width={32}
                alt='auth icon'
                id='auth-icon'
              />
            </MotionElement>
          </MotionElement>
        </div>
      </div>
    </section>
  )
}

export default HeroVerticalVideo
