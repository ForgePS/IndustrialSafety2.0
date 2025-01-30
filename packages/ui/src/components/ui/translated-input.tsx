'use client'

// Third-party Imports
import { useTranslation } from 'react-i18next'

// Component Imports
import { Input } from './input'
import type { InputProps } from './input'

interface TranslatedInputProps extends InputProps {
  translationKey: string
}

const TranslatedInput = ({ translationKey, ...props }: TranslatedInputProps) => {
  // Hooks
  const { t } = useTranslation()

  return <Input placeholder={t(translationKey)} {...props} />
}

export default TranslatedInput
