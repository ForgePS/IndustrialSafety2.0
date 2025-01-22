// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbConfetti } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

const ThankYouPage = () => {
  return (
    <div className='pli-6 plb-12 flex flex-auto flex-col items-center justify-center gap-6'>
      <div className='bs-16 is-16 bg-primary/10 flex items-center justify-center rounded-full'>
        <TbConfetti className='bs-8 is-8 text-primary' />
      </div>
      <div className='flex flex-col items-center'>
        <h2 className='mbe-4 text-center text-2xl font-semibold'>Thank You for Choosing Us!</h2>
        <p className='md:max-is-4xl text-center'>
          Your order is currently being processed, and you will receive an email with your order details soon.
          <br />
          Please allow a few moments for your subscription to activate.
        </p>
      </div>
      <Button asChild>
        <Link href='/'>Start your journey</Link>
      </Button>
    </div>
  )
}

export default ThankYouPage
