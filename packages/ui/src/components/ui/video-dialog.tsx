'use client'

// React Imports
import { useState } from 'react'

// Third-party Imports
import { TbPlayerPlayFilled, TbX } from 'react-icons/tb'
import { AnimatePresence, motion } from 'framer-motion'

// Component Imports
import { Avatar, AvatarFallback } from './avatar'
import Image from '@repo/ui/components/Image'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

type HeroVideoProps = {
  videoSrc: string
  thumbnailSrcLight: string
  thumbnailSrcDark: string
  thumbnailAlt?: string
  thumbnailClassName?: string
  thumbnailDelay?: number
  className?: string
}

const HeroVideoDialog = ({
  videoSrc,
  thumbnailSrcLight,
  thumbnailSrcDark,
  thumbnailClassName,
  thumbnailDelay,
  thumbnailAlt = 'Video thumbnail',
  className
}: HeroVideoProps) => {
  // States
  const [isVideoOpen, setIsVideoOpen] = useState(false)

  return (
    <div className={cn('relative', className)}>
      <motion.div
        initial='hidden'
        whileInView='show'
        viewport={{ once: true }}
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { delay: thumbnailDelay, duration: 0.4 } }
        }}
        onClick={() => setIsVideoOpen(true)}
        className='group relative cursor-pointer'
      >
        <Image
          srcLight={thumbnailSrcLight}
          srcDark={thumbnailSrcDark}
          alt={thumbnailAlt}
          className={cn(
            'is-full transition-all duration-200 ease-out group-hover:brightness-[0.8]',
            thumbnailClassName
          )}
        />
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='bg-primary flex size-[58px] items-center justify-center rounded-full backdrop-blur-md transition-all duration-200 ease-out group-hover:scale-[1.2]'>
            <div className='relative flex size-[52px] items-center justify-center rounded-full bg-[#9471ff] shadow-md'>
              <TbPlayerPlayFilled className='size-8 fill-white text-white drop-shadow-lg' />
            </div>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {isVideoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setIsVideoOpen(false)}
            exit={{ opacity: 0 }}
            className='bg-backdrop fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md'
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className='is-full max-is-4xl mli-6 md:mli-0 relative aspect-video'
            >
              <Avatar size='lg' shape='circle' className='border-card/60 absolute -top-12 end-0 cursor-pointer border'>
                <AvatarFallback>
                  <TbX className='size-5' />
                </AvatarFallback>
              </Avatar>
              <div className='relative isolate z-[1] size-full overflow-hidden rounded-2xl border-2 border-white'>
                <iframe
                  src={videoSrc}
                  className='size-full rounded-2xl'
                  allowFullScreen
                  allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default HeroVideoDialog
