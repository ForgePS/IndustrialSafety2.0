'use client'

// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import { useFormStatus } from 'react-dom'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'
import type { ButtonProps } from '@repo/ui/components/ui/button'

type Props = ButtonProps & {
  pendingText?: ReactNode
}

const SubmitButton = ({ children, pendingText, ...props }: Props) => {
  // Hooks
  const { pending, action } = useFormStatus()

  const isPending = pending && action === props.formAction

  return (
    <Button {...props} type='submit' disabled={isPending}>
      {isPending ? pendingText : children}
    </Button>
  )
}

export default SubmitButton
