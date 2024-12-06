// Types Imports
import type { CustomInputHorizontalProps } from './types'

// Component Imports
import { Checkbox } from '@repo/ui/components/ui/checkbox'
import { RadioGroupItem } from '@repo/ui/components/ui/radio-group'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const CustomInputHorizontal = (props: CustomInputHorizontalProps) => {
  // Props
  const { type, data, selected, handleChange, className } = props

  // Vars
  const { meta, title, value, content } = data

  const renderData = () => {
    if (meta && title && content) {
      return (
        <div className='bs-full is-full flex flex-col gap-1'>
          <div className='is-full flex items-start justify-between gap-2'>
            {typeof title === 'string' ? <h3 className='text-textPrimary text-base font-medium'>{title}</h3> : title}
            {typeof meta === 'string' ? <span className='text-textDisabled text-base'>{meta}</span> : meta}
          </div>
          {typeof content === 'string' ? <p className='text-textSecondary text-sm'>{content}</p> : content}
        </div>
      )
    } else if (meta && title && !content) {
      return (
        <div className='is-full flex items-start justify-between gap-2'>
          {typeof title === 'string' ? <h3 className='text-textPrimary text-base font-medium'>{title}</h3> : title}
          {typeof meta === 'string' ? <span className='text-textDisabled text-base'>{meta}</span> : meta}
        </div>
      )
    } else if (!meta && title && content) {
      return (
        <div className='bs-full flex flex-col gap-1'>
          {typeof title === 'string' ? <h3 className='text-textPrimary text-base font-medium'>{title}</h3> : title}
          {typeof content === 'string' ? <p className='text-textSecondary text-sm'>{content}</p> : content}
        </div>
      )
    } else if (!meta && !title && content) {
      return typeof content === 'string' ? <p className='text-textSecondary text-sm'>{content}</p> : content
    } else if (!meta && title && !content) {
      return typeof title === 'string' ? <h3 className='text-textPrimary text-base font-medium'>{title}</h3> : title
    } else {
      return null
    }
  }

  return data ? (
    <div
      onClick={() => handleChange(value)}
      className={cn(
        'border-input text-textPrimary bs-full relative flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors',
        { 'border-primary': type === 'radio' ? selected === value : selected.includes(value) },
        className
      )}
    >
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
      {renderData()}
    </div>
  ) : null
}

export default CustomInputHorizontal
