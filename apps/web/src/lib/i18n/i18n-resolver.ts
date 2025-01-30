// Third-party Imports
import type { Resolver } from '@repo/i18n/I18nProvider'

/**
 * Resolves the translation file for a given language and namespace
 */
export const i18nResolver: Resolver = async (language, namespace) => {
  const data = await import(`@/data/locales/${language}/${namespace}.json`)

  return data
}
