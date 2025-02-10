'use client'

// React Imports
import { useTransition } from 'react'
import type { BaseSyntheticEvent } from 'react'

// Next Imports
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// Third-party Imports
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Button } from '@repo/ui/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { createClient } from '@repo/supabase/client'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Define Zod Schema for validation
const permissionSchema = (t: TFunction) =>
  z.object({
    permission: z.string().min(1, { message: t('admin:permissionNameRequiredError') })
  })

const Create = () => {
  // States
  const [pending, startTransition] = useTransition()

  // Vars
  const supabase = createClient()

  // Hooks
  const router = useRouter()
  const { t } = useTranslation()

  // Form setup
  const form = useForm<z.infer<ReturnType<typeof permissionSchema>>>({
    resolver: zodResolver(permissionSchema(t)),
    defaultValues: {
      permission: ''
    }
  })

  // Form submission handler
  const onSubmit = (data: z.infer<ReturnType<typeof permissionSchema>>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      try {
        const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

        const { error } = await supabase.from('permissions').insert([
          {
            permission: data.permission
          }
        ])

        if (error) {
          if (error.code === '23505') {
            toast('error', t('admin:permissionExistsError'))

            return
          }

          throw error
        }

        toast('success', t('admin:permissionsCreateSuccess'))

        if (submitAction === 'createAndCreateAnother') {
          form.reset()
        } else {
          router.push('/admin/permissions')
          router.refresh()
        }
      } catch (error: any) {
        toast('error', t('admin:permissionsCreateError', { message: error.message }))
      }
    })
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:permissionsCreateTitle' />
      </h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardContent className='pbs-6'>
              <FormField
                control={form.control}
                name='permission'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className='mbe-2 block text-sm font-medium'>
                      <Trans i18nKey='admin:nameLabel' />
                      <span className='text-destructive'>*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type='text' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/permissions'>
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
