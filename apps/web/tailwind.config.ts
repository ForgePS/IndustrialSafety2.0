import uiTailwindConfig from '@repo/ui/tailwind.config'
import type { Config } from 'tailwindcss'

const config: Config = {
  presets: [uiTailwindConfig],
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./src/**/*.{js,ts,jsx,tsx,css}', '../../packages/ui/src/**/*.{js,ts,jsx,tsx,css}'],
  theme: {
    extend: {}
  }
}

export default config
