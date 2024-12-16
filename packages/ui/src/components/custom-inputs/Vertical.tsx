// Types Imports
import type { CustomInputVerticalProps } from './types'

// Component Imports
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { RadioGroupItem } from '@repo/ui/components/ui/radio-group'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const CustomInputVertical = (props: CustomInputVerticalProps) => {
  // Props
  const { type, data, selected, handleChange, className } = props

  // Vars
  const { title, value, content, asset } = data

  const renderComponent = () => {
    return (
      <div
        onClick={() => handleChange(value)}
        className={cn(
          'border-input text-textPrimary bs-full relative flex cursor-pointer flex-col items-center gap-3 rounded-md border p-4 transition-colors',
          { 'border-primary': type === 'radio' ? selected === value : selected.includes(value) },
          className
        )}
      >
        {asset ?? null}
        {title ? (
          typeof title === 'string' ? (
            <h3 className='text-textPrimary text-base font-medium'>{title}</h3>
          ) : (
            title
          )
        ) : null}
        {content ? (
          typeof content === 'string' ? (
            <p className='text-textSecondary text-sm'>{content}</p>
          ) : (
            content
          )
        ) : null}
        {type === 'radio' ? (
          <RadioGroupItem size='sm' value={value} checked={selected === value} className='min-is-fit' />
        ) : (
          <Checkbox
            size='sm'
            checked={selected.includes(value)}
            onChange={() => handleChange(value)}
            className='min-is-fit'
          />
        )}
      </div>
    )
  }

  return data ? renderComponent() : null
}

export default CustomInputVertical
