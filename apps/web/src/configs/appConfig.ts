/*
 * If you change the following items in the config object, you might not see any effect in the local development server
 * as these are stored in the cookie (cookie has the highest priority over the appConfig):
 * 1. mode
 * 2. layout
 *
 * To see the effect of the above items, clear the cookie from the browser's Application/Storage tab and then reload the page.
 */

// Type Imports
import type { Mode, Layout } from '@repo/ui/types'

export type Config = {
  appName: string
  settingsCookieName: string
  mode: Mode
  layout: Layout
}

const appConfig: Config = {
  appName: 'ChatFlow AI',
  settingsCookieName: 'jetship-nextjs-boilerplate-demo',
  mode: 'light', //? 'light', 'dark', 'system' (It is recommended to set 'light' or 'dark'. If 'system' mode is set, it might cause a flicker on the initial load)
  layout: 'vertical' // 'vertical', 'collapsed'
}

export default appConfig
