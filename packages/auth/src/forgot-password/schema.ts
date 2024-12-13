// Third-party Imports
import { z } from 'zod'

export const forgotPasswordFormSchema = z.object({
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  })
})

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordFormSchema>
