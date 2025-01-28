'use client'

// React Imports
import { useEffect, useState } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { MultiSelect } from '@repo/ui/components/ui/multi-select'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import SubmitButton from '@repo/ui/components/SubmitButton'
import type { Database } from '@repo/supabase/types'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Util Imports
import { createUser } from '../actions'

// Define Zod Schema for validation
const userSchema = (t: TFunction) =>
  z.object({
    name: z.string().min(1, { message: t('admin:nameRequiredError') }),
    email: z
      .string()
      .min(1, { message: t('admin:emailRequiredError') })
      .email({
        message: t('admin:invalidEmailError')
      }),
    password: z
      .string()
      .min(1, { message: t('admin:usersCreatePasswordError') })
      .min(8, {
        message: t('admin:usersCreatePasswordLengthError')
      }),
    roles: z.array(z.string()).nonempty({ message: t('admin:selectRoleError') })
  })

const Create = ({ roles }: { roles: Database['public']['Tables']['roles']['Row'][] }) => {
  // States
  const [selected, setSelected] = useState<string[]>(['user'])

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // react-hook-form integration with Zod schema validation
  const form = useForm({
    resolver: zodResolver(userSchema(t)),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      roles: selected
    }
  })

  const { setValue, clearErrors } = form

  // Form Submit handler
  const onSubmit = async (data: z.infer<ReturnType<typeof userSchema>>) => {
    try {
      const result = await createUser({
        name: data.name,
        email: data.email,
        password: data.password,
        roles: roles,
        selectedRoles: selected
      })

      if ('error' in result) {
        toast('error', result.error || t('admin:usersCreateEditError'))
      } else {
        toast('success', result.message || t('admin:usersCreateSuccess'))
        router.push('/admin/users')
        router.refresh()
      }
    } catch (error) {
      console.error('Error creating user:', error)

      return false
    }
  }

  const createAndCreateSubmit = async (data: z.infer<ReturnType<typeof userSchema>>) => {
    try {
      const result = await createUser({
        name: data.name,
        email: data.email,
        password: data.password,
        roles: roles,
        selectedRoles: selected
      })

      if ('error' in result) {
        toast('error', result.error || t('admin:usersCreateEditError'))
      } else {
        toast('success', result.message || t('admin:usersCreateSuccess'))
        form.reset()
        router.refresh()
      }
    } catch (error) {
      console.error('Error creating user:', error)

      return false
    }
  }

  // Update form value and clear errors when selected changes
  useEffect(() => {
    setValue('roles', selected) // Sync the form's roles field with selected

    if (selected.length > 0) {
      clearErrors('roles') // Clear the error for roles when a role is selected
    }
  }, [selected, setValue, clearErrors])

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>
        <Trans i18nKey='admin:usersCreateTitle' />
      </h2>
      <Form {...form}>
        <form>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='name' className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:nameLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='name' type='text' placeholder={t('admin:namePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='email' className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:emailLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='email' type='email' placeholder={t('admin:emailPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='password' className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:passwordLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input id='password' type='password' placeholder='················' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='roles'
                  render={() => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='roles' className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:rolesLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <MultiSelect
                          className='!bs-[unset]'
                          selected={selected}
                          setSelected={setSelected}
                          options={roles.map(role => ({
                            value: role.role,
                            label: role.role
                          }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton
              formAction={form.handleSubmit(onSubmit as any) as any}
              pendingText={<Trans i18nKey='admin:creatingStatus' />}
            >
              <Trans i18nKey='admin:createButton' />
            </SubmitButton>
            <SubmitButton
              formAction={form.handleSubmit(createAndCreateSubmit as any) as any}
              variant='tonalDefault'
              pendingText={<Trans i18nKey='admin:creatingStatus' />}
            >
              <Trans i18nKey='admin:createAndCreateAnotherButton' />
            </SubmitButton>
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/users'>
                <Trans i18nKey='admin:cancelButton' />
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

export default Create
