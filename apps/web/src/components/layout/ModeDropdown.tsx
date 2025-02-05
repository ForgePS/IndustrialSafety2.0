'use client'

// React Imports
import { useEffect } from 'react'

// Third-party Imports
import { useTheme } from 'next-themes'
import { useMedia } from 'react-use'
import { TbDeviceDesktop, TbSun, TbMoonStars } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@repo/ui/components/ui/dropdown-menu'
import { useSettings } from '@repo/ui/hooks/useSettings'
import Trans from '@repo/i18n/Trans'
import type { Mode } from '@repo/ui/types'

const ModeDropdown = () => {
  // Hooks
  const { setTheme, systemTheme } = useTheme()
  const { settings, updateSettings } = useSettings()
  const isDark = useMedia('(prefers-color-scheme: dark)', systemTheme === 'dark')

  const handleClick = (mode: Mode) => {
    if (settings.mode !== mode) {
      updateSettings({ mode })
    }
  }

  const getModeIcon = () => {
    if (settings.mode === 'system') {
      return <TbDeviceDesktop className='text-[22px]' />
    } else if (settings.mode === 'dark') {
      return <TbMoonStars className='text-[22px]' />
    } else {
      return <TbSun className='text-[22px]' />
    }
  }

  useEffect(() => {
    if (settings.mode) {
      if (settings.mode === 'system') {
        setTheme(isDark ? 'dark' : 'light')
      } else {
        setTheme(settings.mode)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' aria-label='mode-dropdown'>
          {getModeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={settings.mode}>
          <DropdownMenuRadioItem value='light' onClick={() => handleClick('light')} className='gap-2'>
            <TbSun className='text-xl' />
            <Trans i18nKey='layout:lightMode' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='dark' onClick={() => handleClick('dark')} className='gap-2'>
            <TbMoonStars className='text-xl' />
            <Trans i18nKey='layout:darkMode' />
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value='system' onClick={() => handleClick('system')} className='gap-2'>
            <TbDeviceDesktop className='text-xl' />
            <Trans i18nKey='layout:systemMode' />
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ModeDropdown
