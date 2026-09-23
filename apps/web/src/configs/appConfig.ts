/*
 * If you change mode or layout below, clear the settings cookie before
 * validating the change locally because cookie values take precedence.
 */

// Third-party Imports
import { z } from 'zod'

const AppConfigSchema = z.object({
  appName: z
    .string({
      description: 'This is the name of the application.',
      required_error: 'Please provide the variable NEXT_PUBLIC_APP_NAME'
    })
    .min(1),
  title: z
    .string({
      description: 'This is the default title tag of the application.',
      required_error: 'Please provide the variable NEXT_PUBLIC_APP_TITLE'
    })
    .min(1),
  description: z.string({
    description: 'This is the default description of the application.',
    required_error: 'Please provide the variable NEXT_PUBLIC_APP_DESCRIPTION'
  }),
  settingsCookieName: z
    .string({
      description: 'This is the name of the cookie that stores application settings.',
      required_error: 'Please provide the settings cookie name'
    })
    .min(1),
  mode: z.enum(['light', 'dark', 'system']),
  layout: z.enum(['vertical', 'collapsed'])
})

const appConfig = AppConfigSchema.parse({
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Forge Industrial Safety 2.0',
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? '%s | Forge Industrial Safety 2.0',
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    'Forge Industrial Safety 2.0 for safety management, training, compliance, inspections, fleet, emergency management, and reporting.',
  settingsCookieName: 'forge-industrial-safety-2-0-settings',
  mode: 'light',
  layout: 'vertical'
})

export default appConfig
