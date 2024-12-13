'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { useOAuthSignIn } from '@repo/auth/sign-in'
import type { Provider } from '@supabase/supabase-js'

// Component Imports
import SubmitButton from '@repo/ui/components/SubmitButton'

// SVG Imports
import Apple from '@repo/ui/assets/svg/Apple'
import Azure from '@repo/ui/assets/svg/Azure'
import Bitbucket from '@repo/ui/assets/svg/Bitbucket'
import Figma from '@repo/ui/assets/svg/Figma'
import Discord from '@repo/ui/assets/svg/Discord'
import Facebook from '@repo/ui/assets/svg/Facebook'
import Github from '@repo/ui/assets/svg/Github'
import Gitlab from '@repo/ui/assets/svg/Gitlab'
import Google from '@repo/ui/assets/svg/Google'
import Kakao from '@repo/ui/assets/svg/Kakao'
import Keycloak from '@repo/ui/assets/svg/Keycloak'
import LinkedIn from '@repo/ui/assets/svg/LinkedIn'
import Notion from '@repo/ui/assets/svg/Notion'
import Slack from '@repo/ui/assets/svg/Slack'
import Spotify from '@repo/ui/assets/svg/Spotify'
import Twitch from '@repo/ui/assets/svg/Twitch'
import Twitter from '@repo/ui/assets/svg/Twitter'
import WorkOS from '@repo/ui/assets/svg/WorkOS'
import Zoom from '@repo/ui/assets/svg/Zoom'
import Fly from '@repo/ui/assets/svg/Fly'

type OAuthProviderLogo = Record<Provider, { name: string; logo: ReactNode }>

const getOAuthProviderLogo = (): OAuthProviderLogo => {
  return {
    apple: { name: 'Apple', logo: <Apple className='text-xl' /> },
    azure: { name: 'Azure', logo: <Azure className='text-xl' /> },
    bitbucket: { name: 'Bitbucket', logo: <Bitbucket className='text-xl' /> },
    discord: { name: 'Discord', logo: <Discord className='text-xl' /> },
    facebook: { name: 'Facebook', logo: <Facebook className='text-xl' /> },
    figma: { name: 'Figma', logo: <Figma className='text-xl' /> },
    github: { name: 'GitHub', logo: <Github className='text-xl' /> },
    gitlab: { name: 'GitLab', logo: <Gitlab className='text-xl' /> },
    google: { name: 'Google', logo: <Google className='text-xl' /> },
    kakao: { name: 'Kakao', logo: <Kakao className='text-xl' /> },
    keycloak: { name: 'Keycloak', logo: <Keycloak className='text-xl' /> },
    linkedin: { name: 'LinkedIn', logo: <LinkedIn className='text-xl' /> },
    linkedin_oidc: { name: 'LinkedIn OIDC', logo: <LinkedIn className='text-xl' /> },
    notion: { name: 'Notion', logo: <Notion className='text-xl' /> },
    slack: { name: 'Slack', logo: <Slack className='text-xl' /> },
    slack_oidc: { name: 'Slack OIDC', logo: <Slack className='text-xl' /> },
    spotify: { name: 'Spotify', logo: <Spotify className='text-xl' /> },
    twitch: { name: 'Twitch', logo: <Twitch className='text-xl' /> },
    twitter: { name: 'Twitter', logo: <Twitter className='text-xl' /> },
    workos: { name: 'WorkOS', logo: <WorkOS className='text-xl' /> },
    zoom: { name: 'Zoom', logo: <Zoom className='text-xs' /> },
    fly: { name: 'Fly', logo: <Fly className='text-xl' /> }
  }
}

const OauthProviders = ({ providers }: { providers: Provider[] }) => {
  // Hooks
  const { handleSignIn } = useOAuthSignIn()

  return (
    <form className='flex flex-col gap-4'>
      {providers.map(provider => {
        return (
          <SubmitButton
            key={provider}
            formAction={() => handleSignIn(provider)}
            variant='ghost'
            className='is-full'
            pendingText={
              <>
                {getOAuthProviderLogo()[provider].logo}
                <span className='text-textPrimary'>{`Signing in with ${getOAuthProviderLogo()[provider].name}...`}</span>
              </>
            }
          >
            {getOAuthProviderLogo()[provider].logo}
            <span className='text-textPrimary'>{`Sign in with ${getOAuthProviderLogo()[provider].name}`}</span>
          </SubmitButton>
        )
      })}
    </form>
  )
}

export default OauthProviders
