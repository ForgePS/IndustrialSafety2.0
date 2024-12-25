export type Resolver = (lang: string, namespace: string) => Promise<Record<string, string>>

/**
 * Resolves the translation file for a given language and namespace
 */
export const i18nResolver: Resolver = async (language, namespace) => {
  const data = await import(`@/data/locales/${language}/${namespace}.json`)

  return data
}
