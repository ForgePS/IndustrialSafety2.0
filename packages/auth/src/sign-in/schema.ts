// Third-party Imports
import { z } from 'zod'
import type { TFunction } from 'i18next'

// Password Form Schema
export const passwordSignInFormSchema = (t: TFunction) =>
  z.object({
    email: z
      .string()
      .min(1, { message: t('packages-auth:emailRequired') })
      .email({
        message: t('packages-auth:emailInvalid')
      }),
    password: z
      .string()
      .min(1, { message: t('packages-auth:passwordRequired') })
      .min(8, {
        message: t('packages-auth:passwordMinLength')
      })
  })

export type PasswordSignInFormData = z.infer<ReturnType<typeof passwordSignInFormSchema>>

// Magic Link Form Schema
export const magicLinkFormSchema = (t: TFunction) =>
  z.object({
    email: z
      .string()
      .min(1, { message: t('packages-auth:emailRequired') })
      .email({
        message: t('packages-auth:emailInvalid')
      })
  })

export type MagicLinkFormData = z.infer<ReturnType<typeof magicLinkFormSchema>>
