'use client'

// React Imports
import { cloneElement, forwardRef, useState } from 'react'
import type { HTMLAttributes, MouseEvent, ReactElement } from 'react'

// Third-party Imports
import { TbStarFilled } from 'react-icons/tb'

// Util Imports
import { cn } from '@repo/ui/lib/utils'

const ratingVariants = {
  size: {
    sm: 'bs-4 is-4',
    md: 'bs-6 is-6',
    lg: 'bs-10 is-10'
  },
  color: {
    default: 'text-warning',
    primary: 'text-primary'
  }
}

interface RatingsProps extends HTMLAttributes<HTMLDivElement> {
  rating: number
  name?: string
  size?: keyof typeof ratingVariants.size
  color?: keyof typeof ratingVariants.color
  totalStars?: number
  Icon?: ReactElement
  onRatingChange?: (rating: number) => void
  disabled?: boolean
}

interface PartialStarProps {
  fillPercentage: number
  size: keyof typeof ratingVariants.size
  color: keyof typeof ratingVariants.color
  Icon: ReactElement
  className?: string
}

const PartialStar = (props: PartialStarProps) => {
  // Props
  const { fillPercentage, size, color, className, Icon } = props

  return (
    <div className='relative inline-block'>
      {cloneElement(Icon, {
        className: cn('stroke-current opacity-30', ratingVariants.size[size], ratingVariants.color[color], className)
      })}
      <div
        className='absolute top-0 overflow-hidden'
        style={{
          width: `${fillPercentage * 100}%`
        }}
      >
        {cloneElement(Icon, {
          className: cn('fill-current', ratingVariants.size[size], ratingVariants.color[color], className)
        })}
      </div>
    </div>
  )
}

export const Ratings = forwardRef<HTMLDivElement, RatingsProps>((props, ref) => {
  // Props
  const {
    rating: initialRating,
    color = 'default',
    size = 'md',
    totalStars = 5,
    Icon = <TbStarFilled />,
    onRatingChange,
    disabled = false,
    className,
    ...rest
  } = props

  // States
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [currentRating, setCurrentRating] = useState(initialRating > totalStars ? totalStars : initialRating)

  const handleMouseEnter = (event: MouseEvent<HTMLDivElement>) => {
    const starIndex = parseInt((event.currentTarget as HTMLDivElement).dataset.starIndex || '0')

    setHoverRating(starIndex)
  }

  const handleMouseLeave = () => {
    setHoverRating(null)
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!disabled) {
      const starIndex = parseInt((event.currentTarget as HTMLDivElement).dataset.starIndex || '0')

      setCurrentRating(starIndex)
      setHoverRating(null)

      if (onRatingChange) {
        onRatingChange(starIndex)
      }
    }
  }

  const displayRating = disabled ? initialRating : (hoverRating ?? currentRating)
  const fullStars = Math.floor(displayRating)

  const partialStar =
    displayRating % 1 > 0 ? (
      <PartialStar fillPercentage={displayRating % 1} size={size} color={color} Icon={Icon} />
    ) : null

  return (
    <div
      ref={ref}
      className={cn('is-fit flex items-center', { 'pointer-events-none': disabled }, className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {[...Array(fullStars)].map((_, i) =>
        cloneElement(Icon, {
          key: i,
          className: cn('fill-current', ratingVariants.size[size], ratingVariants.color[color]),
          onClick: handleClick,
          onMouseEnter: handleMouseEnter,
          'data-star-index': i + 1
        })
      )}
      {partialStar}
      {[...Array(totalStars - fullStars - (partialStar ? 1 : 0))].map((_, i) =>
        cloneElement(Icon, {
          key: i + fullStars + 1,
          className: cn('stroke-current opacity-30', ratingVariants.size[size], ratingVariants.color[color]),
          onClick: handleClick,
          onMouseEnter: handleMouseEnter,
          'data-star-index': i + fullStars + 1
        })
      )}
      <input type='hidden' name={props.name ?? 'ratings'} value={currentRating} />
    </div>
  )
})
