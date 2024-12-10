'use client'

// React Imports
import { useState, useEffect } from 'react'

// Next Imports
import { useRouter, useSearchParams } from 'next/navigation'

// Third-party Imports
import { TbWorld, TbLayout2, TbHeart, TbAdjustments, TbShare } from 'react-icons/tb'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui/components/ui/tabs'
import { Card, CardHeader } from '@repo/ui/components/ui/card'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Application from './Application'
import Tracking from './Tracking'
import SocialLinks from './SocialLinks'
import FeatureToggle from './FeatureToggle'
import ShareBlog from './ShareBlog'

const GeneralSettings = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // Hooks
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get('settings-tab') || 'application'

  // State
  const [activeTab, setActiveTab] = useState(initialTab)

  const handleTabChange = (tab: string) => {
    const searchParams = new URLSearchParams(window.location.search)

    searchParams.set('settings-tab', tab)

    router.push(`/admin/settings/general-settings?${searchParams.toString()}`)
  }

  // Set the active tab
  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  return (
    <>
      <h1 className='mbe-6 text-2xl font-semibold sm:text-3xl'>General Settings</h1>
      <Card>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <CardHeader className='border-be'>
            <TabsList className='flex flex-wrap justify-start gap-y-4 bg-transparent'>
              <TabsTrigger value='application' className='flex items-center gap-2'>
                <TbWorld className='bs-5 is-5' />
                Application
              </TabsTrigger>
              <TabsTrigger value='tracking' className='flex items-center gap-2'>
                <TbLayout2 className='bs-5 is-5' />
                Tracking
              </TabsTrigger>
              <TabsTrigger value='social-links' className='flex items-center gap-2'>
                <TbHeart className='bs-5 is-5' />
                Social Links
              </TabsTrigger>
              <TabsTrigger value='pages-components' className='flex items-center gap-2'>
                <TbAdjustments className='bs-5 is-5' />
                Pages & Components
              </TabsTrigger>
              <TabsTrigger value='share' className='flex items-center gap-2'>
                <TbShare className='bs-5 is-5' />
                Share This (Blog)
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <TabsContent value='application'>
            <Application settings={settings} />
          </TabsContent>
          <TabsContent value='tracking'>
            <Tracking settings={settings} />
          </TabsContent>
          <TabsContent value='social-links'>
            <SocialLinks settings={settings} />
          </TabsContent>
          <TabsContent value='pages-components'>
            <FeatureToggle settings={settings} />
          </TabsContent>
          <TabsContent value='share'>
            <ShareBlog settings={settings} />
          </TabsContent>
        </Tabs>
      </Card>
    </>
  )
}

export default GeneralSettings
