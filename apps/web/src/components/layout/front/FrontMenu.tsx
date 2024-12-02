'use client'

// React Imports
import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'

// Next Imports
import { usePathname } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { useMedia } from 'react-use'
import { TbClipboardList, TbCrown, TbCurrencyDollar, TbListDetails, TbMenu2 } from 'react-icons/tb'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@repo/ui/components/ui/sheet'
import { Button } from '@repo/ui/components/ui/button'
import ReactPerfectScrollbar from '@repo/ui/components/ReactPerfectScrollbar'
import { cn } from '@repo/ui/lib/utils'

type WrapperProps = {
  children: ReactNode
  open: boolean
  setOpen: (value: boolean) => void
  isBreakpointReached: boolean
}

const Wrapper = ({ open, setOpen, isBreakpointReached, children }: WrapperProps) => {
  useEffect(() => {
    if (!isBreakpointReached) {
      setOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBreakpointReached])

  return (
    <>
      <div className='max-xl:flex xl:hidden'>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant='ghost' size='icon'>
              <TbMenu2 className='cursor-pointer text-lg xl:hidden' />
            </Button>
          </SheetTrigger>
          <SheetContent side='left' className='p-0'>
            <SheetTitle hidden />
            <SheetDescription hidden />
            <ReactPerfectScrollbar options={{ wheelPropagation: false, suppressScrollX: true }}>
              <div className='pli-3 plb-9 flex flex-col gap-1'>{children}</div>
            </ReactPerfectScrollbar>
          </SheetContent>
        </Sheet>
      </div>
      <div className='hidden gap-5 xl:flex'>{children}</div>
    </>
  )
}

const FrontMenu = ({ isBlogEnabled }: { isBlogEnabled: boolean }) => {
  // States
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)

  // Hooks
  const pathname = usePathname()
  const isBreakpointReached = useMedia('(max-width: 1280px)', false)

  useEffect(() => {
    setActive(null)
    const landingPage = document.getElementById('landing-page')

    if (landingPage) {
      const sections = Array.from(landingPage.children)

      const observer = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              setActive(entry.target.id)
            }
          })
        },
        {
          rootMargin: '-50% 0px -50% 0px',
          threshold: 0
        }
      )

      sections.forEach(section => {
        observer.observe(section)
      })

      return () => observer.disconnect()
    }
  }, [pathname])

  return (
    <Wrapper open={open} setOpen={setOpen} isBreakpointReached={isBreakpointReached}>
      <Link
        href='/#features-section'
        className={cn({
          'pli-3 plb-[9px] flex items-center gap-1.5 rounded-md': isBreakpointReached,
          'bg-primary/10': isBreakpointReached && active === 'features-section',
          'link-animated': !isBreakpointReached,
          'text-primary': active === 'features-section'
        })}
        onClick={() => setOpen(false)}
      >
        <TbCrown className='text-2xl xl:hidden' />
        <span>Features</span>
      </Link>
      <Link
        href='/#pricing-section'
        className={cn({
          'pli-3 plb-[9px] flex items-center gap-1.5 rounded-md': isBreakpointReached,
          'bg-primary/10': isBreakpointReached && active === 'pricing-section',
          'link-animated': !isBreakpointReached,
          'text-primary': active === 'pricing-section'
        })}
        onClick={() => setOpen(false)}
      >
        <TbCurrencyDollar className='text-2xl xl:hidden' />
        <span>Pricing & Plans</span>
      </Link>
      {isBlogEnabled && (
        <Link
          href='/blog'
          className={cn({
            'pli-3 plb-[9px] flex items-center gap-1.5 rounded-md': isBreakpointReached,
            'bg-primary/10': isBreakpointReached && pathname.includes('/blog'),
            'link-animated': !isBreakpointReached,
            'text-primary': pathname.includes('/blog')
          })}
          onClick={() => setOpen(false)}
        >
          <TbClipboardList className='text-2xl xl:hidden' />
          <span>Blog</span>
        </Link>
      )}
      <Link
        href='/faqs'
        className={cn({
          'pli-3 plb-[9px] flex items-center gap-1.5 rounded-md': isBreakpointReached,
          'bg-primary/10': isBreakpointReached && pathname === '/faqs',
          'link-animated': !isBreakpointReached,
          'text-primary': pathname === '/faqs'
        })}
        onClick={() => setOpen(false)}
      >
        <TbListDetails className='text-2xl xl:hidden' />
        <span>FAQ</span>
      </Link>
    </Wrapper>
  )
}

export default FrontMenu
