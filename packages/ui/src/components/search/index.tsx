'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import {
  TbSearch,
  TbArrowUp,
  TbArrowDown,
  TbCornerDownLeft,
  TbDashboard,
  TbUser,
  TbFileText,
  TbHome
} from 'react-icons/tb'
import * as Icons from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'

// Component Imports
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@repo/ui/components/ui/command'
import { Button } from '@repo/ui/components/ui/button'

export type SearchDataProps = {
  id: string
  name: string
  url: string
  icon: keyof typeof Icons
  showFor?: 'all' | 'admin' | 'user'
  dynamicUrl?: boolean
  baseUrl?: string
  permission?: string
  openInNewTab?: boolean
}

// To render dynamic icons only for search results
const DynamicIcon = (icon: keyof typeof Icons) => {
  // eslint-disable-next-line import/namespace
  const IconComponent = Icons[icon]

  if (!IconComponent) return null

  return <IconComponent className='me-2' />
}

const Search = ({ data, roles }: { data: SearchDataProps[]; roles: string[] }) => {
  // States
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const isAdmin = roles?.includes('admin')

  // Hooks
  const { t } = useTranslation()
  const router = useRouter()

  // Transform search data based on roles and permissions
  const transformedData = data
    .map(item => {
      // Handle dynamic URLs (like Dashboard and My Profile)
      if (item.dynamicUrl && item.baseUrl !== undefined) {
        const prefix = isAdmin ? '/admin' : '/dashboard'

        return {
          ...item,
          url: `${prefix}${item.baseUrl}`
        }
      }

      // For non-dynamic URLs, keep as is
      return item
    })
    .filter(item => {
      // For items without permissions, show based on route type
      if (!item.permission) {
        if (item.url?.startsWith('/admin') && !isAdmin) return false
        if (item.url?.startsWith('/dashboard') && isAdmin) return false

        return true
      }

      // For items with permissions, they're already filtered by getSearchData
      return true
    })

  // To Open the menu when the button is clicked
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  // To handle the selection of the search item
  const handleSelect = (url: string, openInNewTab?: boolean) => {
    setIsOpen(false)
    openInNewTab ? window.open(url, '_blank') : router.push(url)
  }

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setIsOpen(open => !open)
      }
    }

    document.addEventListener('keydown', down)

    return () => document.removeEventListener('keydown', down)
  }, [])

  // Reset the search value when the menu is closed
  useEffect(() => {
    if (!isOpen) setSearchValue('')
  }, [isOpen])

  return (
    <Command
      value={searchValue}
      onValueChange={setSearchValue}
      filter={(value, search) => {
        if (value.includes(search)) return 1

        return 0
      }}
    >
      <div className='flex items-center gap-1' onClick={() => setIsOpen(true)}>
        <Button variant='ghost' size='icon' aria-label='search-toggler'>
          <TbSearch className='bs-5 is-5' />
        </Button>
        <p className='text-textDisabled cursor-pointer'>
          <span>
            <Trans i18nKey='packages-ui:searchButton' />
          </span>
          <span className='mis-2.5'>⌘K</span>
        </p>
      </div>
      <CommandDialog open={isOpen} onOpenChange={handleOpenChange}>
        <CommandInput
          placeholder={t('packages-ui:searchPlaceholder')}
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList>
          <CommandEmpty>
            <Trans i18nKey='packages-ui:searchNoResults' />
          </CommandEmpty>
          {searchValue ? (
            <>
              <CommandGroup heading={<Trans i18nKey='packages-ui:searchResultsHeading' />}>
                {transformedData.map(item => (
                  <CommandItem key={item.id} onSelect={() => handleSelect(item.url, item.openInNewTab)}>
                    {item.icon && DynamicIcon(item.icon)}
                    {t(item.name)}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : (
            <>
              {isAdmin ? (
                <CommandGroup heading={<Trans i18nKey='packages-ui:searchAdminDashboard' />}>
                  <CommandItem onSelect={() => handleSelect('/admin')}>
                    <TbDashboard className='me-2' />
                    <Trans i18nKey='packages-ui:searchDashboard' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/my-profile')}>
                    <TbUser className='me-2' />
                    <Trans i18nKey='packages-ui:searchMyProfile' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/billing')}>
                    <TbFileText className='me-2' />
                    <Trans i18nKey='packages-ui:searchBilling' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/', true)}>
                    <TbHome className='me-2' />
                    <Trans i18nKey='packages-ui:searchLandingPage' />
                  </CommandItem>
                </CommandGroup>
              ) : (
                <CommandGroup heading={<Trans i18nKey='packages-ui:searchUserDashboard' />}>
                  <CommandItem onSelect={() => handleSelect('/dashboard')}>
                    <TbDashboard className='me-2' />
                    <Trans i18nKey='packages-ui:searchDashboard' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/my-profile')}>
                    <TbUser className='me-2' />
                    <Trans i18nKey='packages-ui:searchMyProfile' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/billing')}>
                    <TbFileText className='me-2' />
                    <Trans i18nKey='packages-ui:searchBilling' />
                  </CommandItem>
                  <CommandItem onSelect={() => handleSelect('/', true)}>
                    <TbHome className='me-2' />
                    <Trans i18nKey='packages-ui:searchLandingPage' />
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
        <div className='is-full pli-4 plb-2 border-bs flex justify-end gap-x-10 max-sm:hidden'>
          <div className='flex items-center gap-1.5'>
            <kbd className='bg-accent rounded p-0.5'>
              <TbArrowUp className='bs-4 is-4' />
            </kbd>
            <kbd className='bg-accent rounded p-0.5'>
              <TbArrowDown className='bs-4 is-4' />
            </kbd>
            <span className='text-xs'>
              <Trans i18nKey='packages-ui:searchNavigateText' />
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <kbd className='bg-accent rounded p-0.5'>
              <TbCornerDownLeft className='bs-4 is-4' />
            </kbd>
            <span className='text-xs'>
              <Trans i18nKey='packages-ui:searchSelectText' />
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <kbd className='bg-accent plb-1 pli-1.5 flex items-center rounded'>
              <span className='text-xs'>Esc</span>
            </kbd>
            <span className='text-xs'>
              <Trans i18nKey='packages-ui:searchCloseText' />
            </span>
          </div>
        </div>
      </CommandDialog>
    </Command>
  )
}

export default Search
