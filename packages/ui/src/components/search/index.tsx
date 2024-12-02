'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import Link from 'next/link'

// Third-party Imports
import { TbSearch, TbArrowUp, TbArrowDown, TbCornerDownLeft } from 'react-icons/tb'

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
  icon?: string
}

const Search = ({ data }: { data: SearchDataProps[] }) => {
  // States
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  // To Open the menu when the button is clicked
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  // To Close on select
  const handleClose = () => {
    setIsOpen(false)
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
          <span>Search</span>
          <span className='mis-2.5'>⌘K</span>
        </p>
      </div>
      <CommandDialog open={isOpen} onOpenChange={handleOpenChange}>
        <CommandInput placeholder='Type a command or search...' value={searchValue} onValueChange={setSearchValue} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchValue ? (
            <>
              <CommandGroup heading='Results'>
                {data.map(item => (
                  <CommandItem key={item.id} onSelect={handleClose}>
                    <Link href={item.url}>{item.name}</Link>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          ) : (
            <CommandGroup heading='Suggestions'>
              <CommandItem onSelect={handleClose}>
                <Link href='/admin'>Profile</Link>
              </CommandItem>
              <CommandItem onSelect={handleClose}>
                <Link href='/admin'>Billings</Link>
              </CommandItem>
              <CommandItem onSelect={handleClose}>
                <Link href='/admin'>Settings</Link>
              </CommandItem>
            </CommandGroup>
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
            <span className='text-xs'>to navigate</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <kbd className='bg-accent rounded p-0.5'>
              <TbCornerDownLeft className='bs-4 is-4' />
            </kbd>
            <span className='text-xs'>to select</span>
          </div>
          <div className='flex items-center gap-1.5'>
            <kbd className='bg-accent plb-1 pli-1.5 flex items-center rounded'>
              <span className='text-xs'>Esc</span>
            </kbd>
            <span className='text-xs'>to close</span>
          </div>
        </div>
      </CommandDialog>
    </Command>
  )
}

export default Search
