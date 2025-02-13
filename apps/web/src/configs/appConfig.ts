/*
 * If you change the following items in the config object, you might not see any effect in the local development server
 * as these are stored in the cookie (cookie has the highest priority over the appConfig):
 * 1. mode
 * 2. layout
 *
 * To see the effect of the above items, clear the cookie from the browser's Application/Storage tab and then reload the page.
 */

// Third-party Imports
import { z } from 'zod'

const AppConfigSchema = z.object({
  appName: z
    .string({
      description: 'This is the name of your SaaS. Ex. "ChatFlow AI"',
      required_error: 'Please provide the variable NEXT_PUBLIC_APP_NAME'
    })
    .min(1),
  title: z
    .string({
      description: 'This is the default title tag of your SaaS.',
      required_error: 'Please provide the variable NEXT_PUBLIC_APP_TITLE'
    })
    .min(1),
  description: z.string({
    description: 'This is the default description of your SaaS.',
    required_error: 'Please provide the variable NEXT_PUBLIC_APP_DESCRIPTION'
  }),
  settingsCookieName: z
    .string({
      description: 'This is the name of the cookie that stores the settings of your SaaS.',
      required_error: 'Please provide the variable NEXT_PUBLIC_SETTINGS_COOKIE_NAME'
    })
    .min(1),
  mode: z.enum(['light', 'dark', 'system']),
  layout: z.enum(['vertical', 'collapsed'])
})

const appConfig = AppConfigSchema.parse({
  appName: process.env.NEXT_PUBLIC_APP_NAME,
  title: process.env.NEXT_PUBLIC_APP_TITLE,
  description:
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    'Automate customer support with ChatFlow AI. Resolve queries 24/7, and deliver seamless service using an all-in-one AI chatbot solution.',
  settingsCookieName: 'jetship-nextjs-boilerplate-demo',
  mode: 'light', //? 'light', 'dark', 'system' (It is recommended to set 'light' or 'dark'. If 'system' mode is set, it might cause a flicker on the initial load)
  layout: 'vertical' // 'vertical', 'collapsed'
})

export default appConfig
