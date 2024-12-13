// Third-party Imports
import {
  TbBrandGithub,
  TbBrandDiscord,
  TbBrandTwitter,
  TbBrandInstagram,
  TbBrandYoutube,
  TbCheck
} from 'react-icons/tb'

// Component Imports
import Logo from '@components/layout/front/Logo'

import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@repo/ui/components/ui/dialog'
import LeftSection from '@repo/ui/auth/LeftSection'

// Util Imports
import { getAppName } from '@/utils/getAppName'

const WaitListAdvanced = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className='min-bs-screen flex'>
      <LeftSection />
      <div className='bg-card min-bs-screen basis-full lg:basis-2/5 xl:basis-1/3'>
        <div className='plb-[12rem] bs-full flex grow flex-col items-center justify-center'>
          <div className='is-10/12 md:is-1/2 lg:is-4/5 mli-auto mbs-6 flex flex-col gap-6'>
            <Logo appName={appName} />
            <div className='flex flex-col gap-y-1.5'>
              <h1 className='text-textPrimary text-2xl font-semibold'>Get early access!</h1>
              <p className='text-textSecondary'>Join the waitlist for the best SaaS Nextjs Boilerplate</p>
            </div>
            <div className='flex flex-col gap-4'>
              <div>
                <Label htmlFor='name'>
                  Name<sup className='text-destructive'>*</sup>
                </Label>
                <Input id='name' type='text' placeholder='Enter your name' />
              </div>
              <div>
                <Label htmlFor='email'>
                  Email address<sup className='text-destructive'>*</sup>
                </Label>
                <Input id='email' type='email' placeholder='Enter your email address' />
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Join the waitlist</Button>
                </DialogTrigger>
                <DialogContent className='sm:max-is-[425px]'>
                  <DialogTitle hidden />
                  <DialogDescription hidden />
                  <div className='flex flex-col items-center justify-center gap-y-6'>
                    <div className='is-[4.25rem] bs-[4.25rem] border-primary/30 flex items-center justify-center rounded-full border'>
                      <div className='is-12 bs-12 bg-primary flex items-center justify-center rounded-full'>
                        <TbCheck className='bs-[32px] is-[32px] text-white' />
                      </div>
                    </div>
                    <div>
                      <p className='text-textPrimary text-center text-2xl font-semibold'>
                        We&apos;ve added you to out waiting list!
                      </p>
                      <p className='text-textSecondary text-center'>
                        We&apos;ll let you know when <span className='font-medium'>{appName}</span> is ready.
                      </p>
                    </div>
                    <p className='text-textSecondary text-center text-sm'>
                      {`${appName} is coming soon. Designed by`} <span className='underline'>@themeSelection</span> to
                      give you back your time.
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <p className='text-textSecondary text-center'>
              {`This website is fully made using ${appName}. ©${new Date().getFullYear()} ${appName}. All rights reserved.`}
            </p>
            <div className='flex items-center justify-center gap-2'>
              <Avatar className='bg-neutral/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandGithub className='text-foreground text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar className='bg-accent/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandDiscord className='text-accent/100 text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar className='bg-info/20 bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandTwitter className='text-info text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar color='primary' className='bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandInstagram className='text-lg' />
                </AvatarFallback>
              </Avatar>
              <Avatar color='destructive' className='bs-[30px] is-[30px]'>
                <AvatarFallback>
                  <TbBrandYoutube className='text-lg' />
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WaitListAdvanced
