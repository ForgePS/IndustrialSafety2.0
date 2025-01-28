'use client'

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
import SubmitButton from '@repo/ui/components/SubmitButton'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

// Define Zod Schema for validation
const permissionSchema = (t: TFunction) =>
  z.object({
    permission: z.string().min(1, { message: t('admin:permissionNameRequiredError') })
  })

const Create = () => {
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
  const onSubmit = async (data: z.infer<ReturnType<typeof permissionSchema>>) => {
    try {
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
      router.push('/admin/permissions')
      router.refresh()
    } catch (error: any) {
      toast('error', t('admin:permissionsCreateError', { message: error.message }))
    }
  }

  // Create and create another handler
  const createAndCreateAnother = async (data: z.infer<ReturnType<typeof permissionSchema>>) => {
    try {
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
      form.reset()
    } catch (error: any) {
      toast('error', t('admin:permissionsCreateError', { message: error.message }))
    }
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>
        <Trans i18nKey='admin:permissionsCreateTitle' />
      </h2>
      <Form {...form}>
        <form>
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
          <div className='mbs-6 flex justify-start gap-4'>
            <SubmitButton
              formAction={form.handleSubmit(onSubmit) as any}
              pendingText={<Trans i18nKey='admin:creatingStatus' />}
            >
              <Trans i18nKey='admin:createButton' />
            </SubmitButton>
            <SubmitButton
              formAction={form.handleSubmit(createAndCreateAnother) as any}
              pendingText={<Trans i18nKey='admin:creatingStatus' />}
            >
              <Trans i18nKey='admin:createAndCreateAnotherButton' />
            </SubmitButton>
            <Button variant='tonalDefault' asChild>
              <Link href='/admin/permissions'>
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
