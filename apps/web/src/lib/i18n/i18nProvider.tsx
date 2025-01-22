'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import I18nProvider from '@repo/i18n/I18nProvider'

// Util Imports
import { i18nResolver } from './i18n-resolver'
import { getI18nSettings } from './i18n-settings'

const I18nProviderComponent = ({ children, lang }: { children: ReactNode; lang: string | undefined }) => {
  const settings = getI18nSettings(lang)

  return (
    <I18nProvider settings={settings} resolver={i18nResolver}>
      {children}
    </I18nProvider>
  )
}

export default I18nProviderComponent
