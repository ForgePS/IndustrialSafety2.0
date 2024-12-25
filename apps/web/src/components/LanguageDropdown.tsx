'use client'

// React Imports
import { useCallback, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbLanguage } from 'react-icons/tb'
import { useTranslation } from 'react-i18next'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup
} from '@repo/ui/components/ui/dropdown-menu'
import { Button } from '@repo/ui/components/ui/button'

const languageLabels: { [key: string]: string } = {
  en: 'English',
  fr: 'French',
  de: 'German'
}

const LanguageDropdown = () => {
  // Hooks
  const { i18n } = useTranslation()
  const router = useRouter()
  const { options } = i18n

  // States
  const [value, setValue] = useState(i18n.language)

  // The cimode locale is a special locale used by i18next for e2e testing
  const locales = (options.supportedLngs as string[]).filter(locale => locale.toLowerCase() !== 'cimode')

  // Handle language change
  const handleLanguageChange = useCallback(
    async (locale: string) => {
      setValue(locale)

      await i18n.changeLanguage(locale)

      // Refresh cached translations
      router.refresh()
    },
    [i18n, router]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='!outline-0' aria-label='language-dropdown'>
          <TbLanguage className='text-xl' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuRadioGroup value={value} onValueChange={handleLanguageChange}>
          {locales.map(locale => {
            const label = languageLabels[locale] || locale

            return (
              <DropdownMenuItem
                asChild
                key={locale}
                onClick={() => handleLanguageChange(locale)}
                className={i18n.language === locale ? 'bg-primary/10 focus:bg-primary/20 text-primary' : ''}
              >
                <span>{label}</span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageDropdown
