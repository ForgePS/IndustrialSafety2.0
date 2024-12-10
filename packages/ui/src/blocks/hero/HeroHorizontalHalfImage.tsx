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

const animateIcons = {
  opacity: 1,
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
}

const HeroHorizontalHalfImage = () => {
  return (
    <section className='pbs-16 -mbs-16 before:is-full before:bs-full before:block-start-0 relative before:absolute before:start-0 before:z-[-1] before:bg-center before:bg-no-repeat before:opacity-[0.15] before:content-[""] before:[background-image:url(/images/blocks/hero/hero-background-v4.png)] before:[background-size:100%_100%]'>
      <div
        className={cn(
          'plb-6 lg:plb-56 grid grid-rows-2 place-items-center lg:grid-cols-2 lg:grid-rows-1',
          frontCommonStyles.layoutSpacing
        )}
      >
        <div className='is-full'>
          <div className='flex flex-col items-center gap-6 max-lg:text-center lg:items-start'>
            <MotionFadeElement
              component='h1'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 0.2, duration: 0.4 }, y: 0 }
              }}
              className='text-3xl font-bold sm:text-4xl md:text-5xl md:leading-[1.2]'
            >
              <span className='from-primary to-destructive bg-gradient-to-r bg-clip-text [-webkit-text-fill-color:transparent]'>
                Effortless SaaS
              </span>{' '}
              🚀
              <br />
              Launch Like a Pro in Days
            </MotionFadeElement>
            <MotionFadeElement
              component='p'
              variants={{
                hidden: { y: 30 },
                show: { transition: { delay: 0.5, duration: 0.4 }, y: 0 }
              }}
              className='text-textSecondary is-3/4 text-lg font-semibold sm:text-xl sm:leading-[1.4]'
            >
              Ship Faster and Focus on Growth with the
              <br />
              All-In-One <span className='text-primary font-bold'>Tech Stack</span> Boilerplate.
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
            className='mbs-8 sm:mbs-12 flex max-lg:justify-center max-sm:flex-col'
          >
            <RainbowButton size='lg' className='!plb-2.5'>
              Get Started Now
              <TbRocket className='text-xl' />
            </RainbowButton>
          </MotionFadeElement>
        </div>
        <div className='block-start-1/2 max-2xl:is-2/5 absolute end-0 -translate-y-1/2 transform max-lg:hidden'>
          <MotionElement
            component='div'
            initial='hidden'
            whileInView='show'
            viewport={{ once: true }}
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { delay: 0.2, duration: 0.4 } }
            }}
            className='relative'
          >
            <Image
              srcLight='/images/blocks/hero/hero-dashboard-v4-light.png'
              srcDark='/images/blocks/hero/hero-dashboard-v4-dark.png'
            />
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                ...animateIcons,
                y: [-5, 5],
                rotate: [-20, 20]
              }}
              className='-block-start-11 bg-card absolute start-32 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)]'
            >
              <img
                className='rounded-[10px]'
                src='/images/logos/nextjs.png'
                height={38}
                width={38}
                alt='Next.js Icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                ...animateIcons,
                y: [5, -5],
                rotate: [19, -19]
              }}
              className='-block-start-8 bg-card absolute end-20 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)]'
            >
              <img className='rounded-[10px]' src='/images/logos/auth.png' height={28} width={28} alt='Auth Icon' />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                ...animateIcons,
                y: [5, -5],
                rotate: [28, -28]
              }}
              className='block-end-[35%] bg-card absolute -start-14 flex -rotate-[28deg] rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)]'
            >
              <img
                className='rounded-[10px]'
                src='/images/logos/supabase.png'
                height={28}
                width={28}
                alt='Supabase Icon'
              />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                ...animateIcons,
                y: [5, -5],
                rotate: [-18, 18]
              }}
              className='-block-end-4 bg-card absolute start-24 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)]'
            >
              <img className='rounded-[10px]' src='/images/logos/stripe.png' height={30} width={30} alt='Stripe Icon' />
            </MotionElement>
            <MotionElement
              component='div'
              initial={{ opacity: 0 }}
              animate={{
                ...animateIcons,
                y: [-5, 5],
                rotate: [21, -21]
              }}
              className='-block-end-6 bg-card absolute end-28 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)]'
            >
              <img
                className='rounded-[10px]'
                src='/images/logos/lemon-squeezy.png'
                height={32}
                width={32}
                alt='Lemon Squeezy Icon'
              />
            </MotionElement>
          </MotionElement>
        </div>
        <div className='md:mbs-12 max-is-xl mli-auto relative lg:hidden'>
          <Image
            srcLight='/images/blocks/hero/hero-dashboard-v1-light.png'
            srcDark='/images/blocks/hero/hero-dashboard-v1-dark.png'
          />
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [-5, 5],
              rotate: [-20, 20]
            }}
            className='-block-start-11 bg-card absolute start-32 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img className='rounded-[10px]' src='/images/logos/nextjs.png' height={38} width={38} alt='Next.js Icon' />
          </MotionElement>
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [5, -5],
              rotate: [19, -19]
            }}
            className='-block-start-8 bg-card absolute end-20 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img className='rounded-[10px]' src='/images/logos/auth.png' height={28} width={28} alt='Auth Icon' />
          </MotionElement>
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [5, -5],
              rotate: [28, -28]
            }}
            className='block-end-[35%] bg-card absolute -start-14 flex -rotate-[28deg] rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img
              className='rounded-[10px]'
              src='/images/logos/supabase.png'
              height={28}
              width={28}
              alt='Supabase Icon'
            />
          </MotionElement>
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [-5, 5],
              rotate: [-12, 12]
            }}
            className='block-start-[35%] bg-card absolute -end-12 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img className='rounded-[10px]' src='/images/logos/shadcn.png' height={32} width={32} alt='Shadcn Icon' />
          </MotionElement>
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [5, -5],
              rotate: [-18, 18]
            }}
            className='-block-end-4 bg-card absolute start-24 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img className='rounded-[10px]' src='/images/logos/stripe.png' height={30} width={30} alt='Stripe Icon' />
          </MotionElement>
          <MotionElement
            component='div'
            initial={{ opacity: 0 }}
            animate={{
              ...animateIcons,
              y: [-5, 5],
              rotate: [21, -21]
            }}
            className='-block-end-6 bg-card absolute end-28 flex rounded-xl p-2 [box-shadow:0px_-10px_57px_0px_rgba(0,0,0,0.16)] max-md:hidden'
          >
            <img
              className='rounded-[10px]'
              src='/images/logos/lemon-squeezy.png'
              height={32}
              width={32}
              alt='Lemon Squeezy Icon'
            />
          </MotionElement>
        </div>
      </div>
    </section>
  )
}

export default HeroHorizontalHalfImage
