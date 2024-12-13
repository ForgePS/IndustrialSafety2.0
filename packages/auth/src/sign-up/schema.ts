// Third-party Imports
import { z } from 'zod'

export const passwordSignUpFormSchema = z
  .object({
    email: z.string().min(1, { message: 'Email address is required.' }).email({
      message: 'Please enter a valid email address.'
    }),
    password: z.string().min(1, { message: 'Password is required.' }).min(8, {
      message: 'Password must be at least 8 characters.'
    }),
    'confirm-password': z.string().min(1, { message: 'Confirm password is required.' }).min(8, {
      message: 'Confirm password must be at least 8 characters.'
    })
  })
  .refine(data => data.password === data['confirm-password'], {
    message: 'Confirm password must match with the password.',
    path: ['confirm-password']
  })

export type PasswordSignUpFormData = z.infer<typeof passwordSignUpFormSchema>
