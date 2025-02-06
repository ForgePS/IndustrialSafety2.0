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

// Define Zod Schema for validation
const roleSchema = z.object({
  role: z.string().min(1, { message: 'Role name is required.' }),
  hierarchy: z.coerce.number().min(1, { message: 'Hierarchy is required.' })
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
  const form = useForm<z.infer<typeof roleSchema>>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      role: '',
      hierarchy: 4
    }
  })

  // Separate checks for role and hierarchy
  const checkDuplicates = async (role: string, hierarchy: number) => {
    const { data } = await supabase
      .from('roles')
      .select('role, hierarchy')
      .or(`role.eq.${role},hierarchy.eq.${hierarchy}`)

    const isRoleExists = data?.some(r => r.role === role)
    const isHierarchyExists = data?.some(r => r.hierarchy === hierarchy)

    return { isRoleExists, isHierarchyExists }
  }

  // Form submission handler
  const onSubmit = (data: z.infer<typeof roleSchema>, event?: BaseSyntheticEvent) => {
    startTransition(async () => {
      try {
        const submitAction = ((event?.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value

        const { isRoleExists, isHierarchyExists } = await checkDuplicates(data.role, data.hierarchy)

        if (isRoleExists) {
          toast('error', t('admin:rolesActionsDuplicateNameError'))

          return
        }

        if (isHierarchyExists) {
          toast('error', t('admin:rolesActionsDuplicateHierarchyError'))

          return
        }

        const { error } = await supabase.from('roles').insert([
          {
            role: data.role,
            hierarchy: data.hierarchy
          }
        ])

        if (error) {
          if (error.code === '23505') {
            // Check which constraint was violated based on the error detail
            if (error.message.includes('roles_role_key')) {
              toast('error', t('admin:rolesActionsDuplicateNameError'))
            } else if (error.message.includes('roles_hierarchy_key')) {
              toast('error', t('admin:rolesActionsDuplicateHierarchyError'))
            }

            return
          }

          throw error
        }

        toast('success', t('admin:rolesActionsCreateSuccess'))

        if (submitAction === 'createAndCreateAnother') {
          form.reset()
        } else {
          router.push('/admin/roles')
          router.refresh()
        }
      } catch (error: any) {
        toast('error', t('admin:rolesActionsCreateError', { message: error.message }))
      }
    })
  }

  return (
    <>
      <h2 className='mbe-6 text-2xl font-semibold sm:text-3xl'>
        <Trans i18nKey='admin:rolesCreateTitle' />
      </h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardContent className='pbs-6'>
              <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='role'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:nameLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('admin:rolesFormNamePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='hierarchy'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='admin:hierarchyLabel' />
                        <span className='text-destructive'>*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min='1'
                          placeholder={t('admin:rolesFormHierarchyPlaceholder')}
                          {...field}
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
              <Link href='/admin/roles'>
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
