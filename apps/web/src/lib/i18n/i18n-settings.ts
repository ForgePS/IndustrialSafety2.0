// Third-party Imports
import type { InitOptions } from 'i18next'

const defaultLanguage = 'en'

export const languages: string[] = ['en', 'fr', 'de']

export const defaultI18nNamespaces = [
  'admin',
  'auth',
  'dashboard',
  'data',
  'front-pages',
  'layout',
  'packages-auth',
  'packages-profile',
  'packages-ui'
]

/**
 * Get the i18n settings for the given language and namespaces.
 * If the language is not supported, it will fall back to the default language.
 */
export function getI18nSettings(language: string | undefined): InitOptions {
  let lng = language ?? defaultLanguage

  if (!languages.includes(lng)) {
    console.warn(`Language "${lng}" is not supported. Falling back to "${defaultLanguage}"`)

    lng = defaultLanguage
  }

  return {
    supportedLngs: languages,
    fallbackLng: languages[0],
    lng,
    ns: defaultI18nNamespaces,
    fallbackNS: defaultI18nNamespaces,
    load: 'languageOnly',
    lowerCaseLng: true,
    react: {
      useSuspense: false
    }
  }
}
