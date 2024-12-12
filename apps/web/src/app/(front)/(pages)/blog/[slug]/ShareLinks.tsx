'use client'

// React Imports
import { useEffect, useState } from 'react'

// Third-party Imports
import { TwitterShareButton, FacebookShareButton, LinkedinShareButton } from 'next-share'
import { TbBrandFacebook, TbBrandLinkedin, TbBrandTwitter } from 'react-icons/tb'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'

const ShareLinks = () => {
  // States
  const [url, setUrl] = useState('')

  useEffect(() => {
    setUrl(window.location.href)
  }, [])

  return (
    <div className='sticky top-20 flex items-center gap-6 max-sm:self-center sm:flex-col'>
      <TwitterShareButton url={url} title='JetShip - NextJS Boilerplate PRO'>
        <Avatar shape='circle' color='secondary' className='bs-[38px] is-[38px]'>
          <AvatarFallback>
            <TbBrandTwitter className='text-foreground text-[22px]' />
          </AvatarFallback>
        </Avatar>
      </TwitterShareButton>
      <FacebookShareButton url={url} quote='JetShip - NextJS Boilerplate PRO' hashtag='#JetShip'>
        <Avatar shape='circle' color='secondary' className='bs-[38px] is-[38px]'>
          <AvatarFallback>
            <TbBrandFacebook className='text-foreground text-[22px]' />
          </AvatarFallback>
        </Avatar>
      </FacebookShareButton>
      <LinkedinShareButton url={url}>
        <Avatar shape='circle' color='secondary' className='bs-[38px] is-[38px]'>
          <AvatarFallback>
            <TbBrandLinkedin className='text-foreground text-[22px]' />
          </AvatarFallback>
        </Avatar>
      </LinkedinShareButton>
    </div>
  )
}

export default ShareLinks
