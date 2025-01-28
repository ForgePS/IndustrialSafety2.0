'use client'

// Third-party Imports
import { useTranslation } from 'react-i18next'

// Component Imports
import { Input } from '@repo/ui/components/ui/input'
import type { InputProps } from '@repo/ui/components/ui/input'

interface TranslatedInputProps extends InputProps {
  translationKey: string
}

const TranslatedInput = ({ translationKey, ...props }: TranslatedInputProps) => {
  // Hooks
  const { t } = useTranslation()

  return <Input placeholder={t(translationKey)} {...props} />
}

export default TranslatedInput
