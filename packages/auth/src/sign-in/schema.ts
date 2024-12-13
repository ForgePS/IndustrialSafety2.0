// Third-party Imports
import { z } from 'zod'

// Password Form Schema
export const passwordSignInFormSchema = z.object({
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  }),
  password: z.string().min(1, { message: 'Password is required.' }).min(8, {
    message: 'Password must be at least 8 characters.'
  })
})

export type PasswordSignInFormData = z.infer<typeof passwordSignInFormSchema>

// Magic Link Form Schema
export const magicLinkFormSchema = z.object({
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  })
})

export type MagicLinkFormData = z.infer<typeof magicLinkFormSchema>
