'use client'

// React Imports
import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

// Third-party Imports
import { TbChevronDown, TbX } from 'react-icons/tb'
import { Command as CommandPrimitive } from 'cmdk'

// Component Imports
import { Badge } from './badge'
import { Command, CommandGroup, CommandItem, CommandList } from './command'
import { Button } from './button'

// Define the generic type for items using Record
type ItemType = Record<'value' | 'label', string>

interface MultiSelectProps {
  options: ItemType[]
  selected: string[]
  setSelected: React.Dispatch<React.SetStateAction<string[]>>
  className?: string
}

export function MultiSelect({ options, selected, setSelected, className }: MultiSelectProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')

  const handleUnselect = useCallback(
    (itemValue: string) => {
      setSelected(prev => prev.filter(value => value !== itemValue))
    },
    [setSelected]
  )

  const handleClearAll = () => {
    setSelected([])
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const input = inputRef.current

      if (input) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (input.value === '') {
            setSelected(prev => {
              const newSelected = [...prev]

              newSelected.pop()

              return newSelected
            })
          }
        }

        // This is not a default behavior of the <input /> field
        if (e.key === 'Escape') {
          input.blur()
        }
      }
    },
    [setSelected]
  )

  const selectableItems = options.filter(item => !selected.includes(item.value))

  return (
    <Command onKeyDown={handleKeyDown} className={`overflow-visible bg-transparent ${className}`}>
      <div className='border-input pli-3 plb-2 focus-within:outline-primary group flex justify-between gap-4 rounded-md border text-sm focus-within:outline-none focus-within:-outline-offset-1'>
        <div className='flex flex-wrap gap-1'>
          {selected.map(itemValue => {
            const item = options.find(opt => opt.value === itemValue)

            return (
              item && (
                <Badge key={item.value} variant='accent' size='md'>
                  {item.label}
                  <div
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleUnselect(item.value)
                      }
                    }}
                    onMouseDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    className='cursor-pointer'
                    onClick={() => handleUnselect(item.value)}
                  >
                    <TbX className='bs-3 is-3' />
                  </div>
                </Badge>
              )
            )
          })}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            placeholder='Select items...'
            className='placeholder:text-muted-foreground flex-1 bg-transparent outline-none'
          />
        </div>
        <div className='flex items-center gap-2'>
          {selected.length > 0 && (
            <Button variant='ghost' size='icon' onClick={handleClearAll}>
              <TbX className='bs-3 is-3 text-muted-foreground hover:text-foreground' />
            </Button>
          )}
          <TbChevronDown className='bs-5 is-5 text-textSecondary shrink-0' />
        </div>
      </div>
      <div className='mbs-2 relative'>
        <CommandList>
          {open && selectableItems.length > 0 ? (
            <div className='is-full bg-popover text-popover-foreground animate-in absolute top-0 z-10 rounded-md border shadow-lg outline-none'>
              <CommandGroup className='bs-full overflow-auto'>
                {selectableItems.map(item => (
                  <CommandItem
                    key={item.value}
                    onMouseDown={e => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onSelect={() => {
                      setInputValue('')
                      setSelected(prev => [...prev, item.value])
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ) : null}
        </CommandList>
      </div>
    </Command>
  )
}
