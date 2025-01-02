// Third-party Imports
import { createInstance } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'
import type { InitOptions } from 'i18next'

/**
 * Initialize the i18n instance on the server.
 * This is useful for React Server Components (RSC) and Server-Side Rendering (SSR).
 */
export async function initializeI18nServer(
  settings: InitOptions,
  resolver: (language: string, namespace: string) => Promise<object>
) {
  const i18nInstance = createInstance()
  const loadedNamespaces = new Set<string>()

  await i18nInstance
    .use(
      resourcesToBackend(async (language, namespace, callback) => {
        try {
          const data = await resolver(language, namespace)

          loadedNamespaces.add(namespace)

          return callback(null, data)
        } catch (error) {
          console.error(`Error loading i18n file: locales/${language}/${namespace}.json`, error)

          return callback(null, {})
        }
      })
    ) // Use HTTP backend for loading translations
    .use(initReactI18next)
    .init(settings)

  return i18nInstance
}
