'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const HeaderSection = () => {
  // States
  const [searchValue, setSearchValue] = useState('')

  // Hooks
  const router = useRouter()

  const handleSubmit = () => {
    const params = new URLSearchParams(window.location.search)

    if (searchValue) {
      params.set('search', searchValue)
    } else {
      params.delete('search')
    }

    // Update the URL
    router.replace(`?${params.toString()}`, {
      scroll: false
    })
  }

  return (
    <section
      id='home'
      className='pbs-16 -mbs-16 relative z-[1] bg-cover bg-center bg-no-repeat [background-image:url(/images/pages/hero-bg.png)]'
    >
      <div
        className={cn(
          'bs-64 sm:bs-[342px] flex flex-col items-center justify-center gap-3',
          frontCommonStyles.layoutSpacing
        )}
      >
        <h1 className='max-is-[657px] relative text-center text-3xl font-bold'>
          FAQ
          <span className='bs-0.5 is-full -block-end-0.5 from-primary/40 to-primary/0 absolute start-0 rounded-full bg-gradient-to-r' />
        </h1>
        <p className='max-is-[657px] text-textSecondary text-center text-lg sm:text-xl'>
          Here are the most frequently asked questions to assist you in making an informed decision.
        </p>
        <form
          onSubmit={e => {
            e.preventDefault()
            handleSubmit()
          }}
          className='max-is-[400px] is-full mbs-4 flex items-center gap-3'
        >
          <Input
            placeholder='Search for a question'
            className='is-full'
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
          />
          <Button type='submit'>Search</Button>
        </form>
      </div>
    </section>
  )
}

export default HeaderSection
