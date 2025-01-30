// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import type { InitOptions, i18n } from 'i18next'

// Util Imports
import { initializeI18nClient } from './i18n-client'

export type Resolver = (lang: string, namespace: string) => Promise<Record<string, string>>

let i18nInstance: i18n

/**
 * Function to load i18n instance asynchronously
 */
async function loadI18nInstance(settings: InitOptions, resolver: Resolver) {
  i18nInstance = await initializeI18nClient(settings, resolver)
}

/**
 * Function to handle i18n client initialization
 */
function useI18nClient(settings: InitOptions, resolver: Resolver) {
  if (
    !i18nInstance ||
    i18nInstance.language !== settings.lng ||
    i18nInstance.options.ns?.length !== settings.ns?.length
  ) {
    throw loadI18nInstance(settings, resolver)
  }

  return i18nInstance
}

/**
 * Provider Component for initializing and passing i18n settings and resolver
 */
const I18nProvider = ({
  children,
  settings,
  resolver
}: {
  children: ReactNode
  settings: InitOptions
  resolver: Resolver
}) => {
  useI18nClient(settings, resolver)

  return <>{children}</>
}

export default I18nProvider
