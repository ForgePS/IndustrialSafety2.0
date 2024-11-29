// React Imports
import type { ChangeEvent, ReactNode } from 'react'

// Types of Horizontal Custom Inputs
export type CustomInputHorizontalData = {
  value: string
  content?: ReactNode
  isSelected?: boolean
} & (
  | {
      meta: ReactNode
      title: ReactNode
    }
  | {
      meta?: never
      title?: never
    }
  | {
      title: ReactNode
      meta?: never
    }
)
export type CustomInputHorizontalProps = {
  data: CustomInputHorizontalData
  className?: string
} & (
  | {
      type: 'checkbox'
      selected: string[]
      handleChange: (value: string) => void
    }
  | {
      type: 'radio'
      selected: string
      handleChange: (value: string | ChangeEvent<HTMLInputElement>) => void
    }
)

// Types of Vertical Custom Inputs
export type CustomInputVerticalData = {
  value: string
  title?: ReactNode
  content?: ReactNode
  isSelected?: boolean
  asset?: ReactNode
}
export type CustomInputVerticalProps = {
  data: CustomInputVerticalData
  className?: string
} & (
  | {
      type: 'checkbox'
      selected: string[]
      handleChange: (value: string) => void
    }
  | {
      type: 'radio'
      selected: string
      handleChange: (value: string | ChangeEvent<HTMLInputElement>) => void
    }
)

// Types of Custom Inputs with Images
export type CustomInputImageData = {
  alt?: string
  value: string
  img: ReactNode
  isSelected?: boolean
}
export type CustomInputImageProps = {
  data: CustomInputImageData
  className?: string
} & (
  | {
      type: 'checkbox'
      selected: string[]
      handleChange: (value: string) => void
    }
  | {
      type: 'radio'
      selected: string
      handleChange: (value: string | ChangeEvent<HTMLInputElement>) => void
    }
)
