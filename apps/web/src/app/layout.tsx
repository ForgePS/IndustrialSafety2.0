// Next Imports
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'

// Third-party Imports
import { clsx } from 'clsx'
import { TooltipProvider } from '@repo/ui/components/ui/tooltip'
import 'react-perfect-scrollbar/dist/css/styles.css'

// Style Imports
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: 'Demo: %s | ChatFlow AI - NextJS Boilerplate PRO',
    default: 'Demo: ChatFlow AI - NextJS Boilerplate PRO'
  },
  description:
    'Automate customer support with ChatFlow AI. Boost satisfaction, resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.'
}

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang='en' className='is-full min-bs-full flex scroll-smooth'>
      <body className={clsx(inter.className, 'is-full min-bs-full flex flex-auto flex-col')}>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
