// Third-party Imports
import { TbRocket } from 'react-icons/tb'

// Components Imports
import { Ratings } from '@repo/ui/components/ui/ratings'
import { MotionElement, MotionFadeElement } from '@repo/ui/components/ui/motion-element'
import AvatarGroup from '@repo/ui/components/ui/avatar-group'
import RainbowButton from '@repo/ui/components/ui/rainbow-button'
import Image from '@repo/ui/components/Image'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '@repo/ui/blocks/styles.module.css'

// Vars
const avatarUrls = ['/images/avatars/1.png', '/images/avatars/2.png', '/images/avatars/3.png', '/images/avatars/4.png']

const HeroHorizontalImage = () => {
  return (
    <section className='pbs-16 -mbs-16 relative bg-cover bg-[center_bottom_2rem] bg-no-repeat [background-image:url(/images/pages/hero-bg.png)]'>
      <div className={cn('grid gap-6 lg:grid-cols-2', frontCommonStyles.layoutSpacing)}>
        <div className='pbs-10 sm:pbs-16 lg:pbe-16 content-center'>
          <div className='flex flex-col items-center gap-6 lg:items-start'>
            <MotionFadeElement
              component='h1'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
              }}
              className='text-3xl font-bold max-lg:text-center sm:text-4xl md:text-5xl md:leading-[1.2]'
            >
              <span className='from-primary to-destructive bg-gradient-to-r bg-clip-text [-webkit-text-fill-color:transparent]'>
                Effortless Support
              </span>{' '}
              🚀
              <br />
              Exceptional Service 24/7
            </MotionFadeElement>
            <MotionFadeElement
              component='p'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 0.5, duration: 0.4 }, y: 0 }
              }}
              className='text-textSecondary md:is-[68%] text-pretty text-lg font-semibold max-lg:text-center sm:text-xl sm:leading-[1.4]'
            >
              Automate Conversations, Resolve Queries Faster, and Boost Customer Satisfaction with the All-in-One{' '}
              <span className='text-primary relative text-nowrap'>
                AI Chatbot Solution.
                <img
                  src='/images/blocks/hero/underline-wave-background.png'
                  className='-block-end-1 max-is-[10.875rem] sm:max-is-48 absolute start-0'
                />
              </span>
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
                <p className='text-textPrimary text-sm leading-4'>Loved by over 1,000+ companies</p>
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
            className='mbs-6 sm:mbs-9 flex max-lg:justify-center max-sm:flex-col'
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
            show: { opacity: 1, transition: { duration: 1.5 } }
          }}
          className='mli-auto lg:mli-0 plb-4 md:plb-8 lg:plb-32 bg-cover bg-center bg-no-repeat [background-image:url(/images/blocks/hero/hero-v1-shape.png)] max-xl:!bg-none'
        >
          <Image
            srcLight='/images/blocks/hero/hero-banner-v1-light.png'
            srcDark='/images/blocks/hero/hero-banner-v1-light.png'
            className='is-full'
          />
        </MotionElement>
      </div>
    </section>
  )
}

export default HeroHorizontalImage
