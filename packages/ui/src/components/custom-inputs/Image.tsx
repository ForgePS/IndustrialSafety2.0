// Types Imports
import type { CustomInputImageProps } from './types'

// Component Imports
import { Checkbox } from '@repo/ui/components/ui/checkbox'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const CustomInputImage = (props: CustomInputImageProps) => {
  // Props
  const { type, data, selected, handleChange, className } = props

  // Vars
  const { alt, img, value } = data

  const renderComponent = () => {
    return (
      <div
        onClick={() => handleChange(value)}
        className={cn(
          'border-input bs-full relative flex cursor-pointer flex-col items-center overflow-hidden rounded-md border transition-colors',
          { 'border-primary': selected.includes(value) },
          className
        )}
      >
        {typeof img === 'string' ? <img src={img} alt={alt ?? `input-image-${value}`} className='max-is-full' /> : img}
        {type === 'radio' ? null : (
          <Checkbox
            size='sm'
            checked={selected.includes(value)}
            onChange={() => handleChange(value)}
            className='min-is-fit absolute end-4 top-3'
          />
        )}
      </div>
    )
  }

  return data ? renderComponent() : null
}

export default CustomInputImage
