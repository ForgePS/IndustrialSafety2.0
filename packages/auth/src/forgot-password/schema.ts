// Third-party Imports
import { z } from 'zod'
import type { TFunction } from 'i18next'

export const forgotPasswordFormSchema = (t: TFunction) =>
  z.object({
    email: z
      .string()
      .min(1, { message: t('packages-auth:emailRequired') })
      .email({
        message: t('packages-auth:emailInvalid')
      })
  })

export type ForgotPasswordFormData = z.infer<ReturnType<typeof forgotPasswordFormSchema>>
