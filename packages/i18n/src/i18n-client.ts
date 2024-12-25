// Third-party Imports
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import type { i18n, InitOptions } from 'i18next'

export async function initializeI18nClient(
  settings: InitOptions,
  resolver: (lang: string, namespace: string) => Promise<object>
): Promise<i18n> {
  const loadedLanguages: string[] = []
  const loadedNamespaces: string[] = []

  await i18next
    .use(
      resourcesToBackend(async (language, namespace, callback) => {
        const data = await resolver(language, namespace)

        if (!loadedLanguages.includes(language)) {
          loadedLanguages.push(language)
        }

        if (!loadedNamespaces.includes(namespace)) {
          loadedNamespaces.push(namespace)
        }

        return callback(null, data)
      })
    )
    .use(LanguageDetector)
    .use(initReactI18next)

    .init(
      {
        ...settings,
        detection: {
          order: ['cookie', 'navigator'],
          caches: ['cookie'],
          lookupCookie: process.env.NEXT_PUBLIC_I18N_COOKIE_NAME
        },
        interpolation: {
          escapeValue: false // React already does escaping
        },
        react: {
          useSuspense: false // Set to true if you want to handle loading states yourself
        }
      },
      err => {
        if (err) {
          console.error('Error initializing i18n', err)
        }
      }
    )

  return i18next
}
