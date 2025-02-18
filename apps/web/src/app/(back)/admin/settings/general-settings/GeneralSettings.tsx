'use client'

// React Imports
import { useState, useEffect } from 'react'

// Next Imports
import { useRouter, useSearchParams } from 'next/navigation'

// Third-party Imports
import { TbLayout2, TbHeart, TbAdjustments, TbShare } from 'react-icons/tb'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui/components/ui/tabs'
import { Card, CardHeader } from '@repo/ui/components/ui/card'
import Trans from '@repo/i18n/Trans'
import type { SettingsConfiguration } from '@repo/supabase/settingsConfigurationTypes'

// Component Imports
import Tracking from './Tracking'
import SocialLinks from './SocialLinks'
import FeatureToggle from './FeatureToggle'
import ShareBlog from './ShareBlog'

const GeneralSettings = ({ settings }: { settings: SettingsConfiguration['general_settings'] }) => {
  // Hooks
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get('settings-tab') || 'tracking'

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
    <div className='grid grid-cols-1 gap-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:settingsGeneralTitle' />
      </h1>
      <Card>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <CardHeader className='border-be'>
            <TabsList className='flex flex-wrap justify-start gap-y-4 bg-transparent max-sm:flex-col'>
              <TabsTrigger value='tracking' className='max-sm:is-full flex items-center gap-2 max-sm:justify-start'>
                <TbLayout2 className='bs-5 is-5' />
                <Trans i18nKey='admin:trackingSection' />
              </TabsTrigger>
              <TabsTrigger value='social-links' className='max-sm:is-full flex items-center gap-2 max-sm:justify-start'>
                <TbHeart className='bs-5 is-5' />
                <Trans i18nKey='admin:socialLinksSection' />
              </TabsTrigger>
              <TabsTrigger
                value='pages-components'
                className='max-sm:is-full flex items-center gap-2 max-sm:justify-start'
              >
                <TbAdjustments className='bs-5 is-5' />
                <Trans i18nKey='admin:settingsTabPagesComponents' />
              </TabsTrigger>
              <TabsTrigger value='share' className='max-sm:is-full flex items-center gap-2 max-sm:justify-start'>
                <TbShare className='bs-5 is-5' />
                <Trans i18nKey='admin:settingsTabShare' />
              </TabsTrigger>
            </TabsList>
          </CardHeader>
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
    </div>
  )
}

export default GeneralSettings
