// Third-party Imports
import { z } from 'zod'
import type { TFunction } from 'i18next'

export const passwordSignUpFormSchema = (t: TFunction) =>
  z
    .object({
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
        }),
      'confirm-password': z
        .string()
        .min(1, { message: t('packages-auth:confirmPasswordRequired') })
        .min(8, {
          message: t('packages-auth:passwordMinLength')
        })
    })
    .refine(data => data.password === data['confirm-password'], {
      message: t('packages-auth:confirmPasswordMatch'),
      path: ['confirm-password']
    })

export type PasswordSignUpFormData = z.infer<ReturnType<typeof passwordSignUpFormSchema>>
