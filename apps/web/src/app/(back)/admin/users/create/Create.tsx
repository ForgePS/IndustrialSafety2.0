'use client'

// React Imports
import { useEffect, useState, useTransition } from 'react'
import type { BaseSyntheticEvent } from 'react'

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
      .min(8, { message: t('admin:usersCreatePasswordLengthError') }),
    roles: z.array(z.string()).min(1, { message: t('admin:selectRoleError') })
  })

const Create = ({ roles }: { roles: Database['public']['Tables']['roles']['Row'][] }) => {
  // States
  const [selected, setSelected] = useState<string[]>(['user'])
  const [pending, startTransition] = useTransition()

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
  const onSubmit = (data: z.infer<ReturnType<typeof userSchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      try {
        const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

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

          if (submitAction === 'createAndCreateAnother') {
            form.reset()
          } else {
            router.push('/admin/users')
            router.refresh()
          }
        }
      } catch (error) {
        console.error('Error creating user:', error)
      }
    })
  }

  // Update form value and clear errors when selected changes
  useEffect(() => {
    setValue('roles', selected) // Sync the form's roles field with selected

    if (selected.length > 0) {
      clearErrors('roles') // Clear the error for roles when a role is selected
    }
  }, [selected, setValue, clearErrors])

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:usersCreateTitle' />
      </h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
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
          <div className='mbs-6 flex gap-4 max-sm:flex-col'>
            <Button type='submit' name='submitAction' value='create' disabled={pending}>
              {pending ? <Trans i18nKey='admin:creatingStatus' /> : <Trans i18nKey='admin:createButton' />}
            </Button>
            <Button
              type='submit'
              name='submitAction'
              variant='tonalDefault'
              value='createAndCreateAnother'
              disabled={pending}
            >
              {pending ? (
                <Trans i18nKey='admin:creatingStatus' />
              ) : (
                <Trans i18nKey='admin:createAndCreateAnotherButton' />
              )}
            </Button>
            <Button type='button' variant='tonalDefault'>
              <Link href='/admin/users'>
                <Trans i18nKey='admin:cancelButton' />
              </Link>
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

export default Create
