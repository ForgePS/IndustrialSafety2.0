'use client'

// React Imports
import { useState, useTransition } from 'react'

// Next Imports
import { useRouter } from 'next/navigation'

// Third-party Imports
import { TbX } from 'react-icons/tb'
import { useDropzone } from 'react-dropzone'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Card, CardContent, CardFooter } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@repo/ui/components/ui/form'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'
import Trans from '@repo/i18n/Trans'
import { useTranslation } from 'react-i18next'

// Type Imports
import type { TFunction } from 'i18next'

// Util Imports
import { uploadAvatarToSupabase, removeAvatarFromSupabase, updateUserProfile } from './client'

// Define Zod Schema for validation
const userSchema = (t: TFunction) =>
  z.object({
    name: z.string().optional(),
    email: z
      .string()
      .min(1, { message: t('packages-profile:emailRequired') })
      .email({
        message: t('packages-profile:emailInvalid')
      }),
    avatarUrl: z.string().optional()
  })

type UserData = {
  id: string
  email: string
  name: string
  avatarUrl: string
  user_avatar: string
  provider: string
}

const PersonalInformation = ({ userData }: { userData: UserData }) => {
  // States
  const [file, setFiles] = useState<File | null>(null)
  const [pending, startTransition] = useTransition()

  const [previewUrl, setPreviewUrl] = useState<string | null>(
    userData.user_avatar ? userData.user_avatar : (userData.avatarUrl ?? '')
  )

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(userData.user_avatar || '')

  // Hooks
  const { t } = useTranslation()
  const router = useRouter()

  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    onDrop: async (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0]

      if (selectedFile) {
        setFiles(selectedFile)
        setPreviewUrl(URL.createObjectURL(selectedFile))
      }
    }
  })

  // react-hook-form integration with Zod schema validation
  const form = useForm({
    resolver: zodResolver(userSchema(t)),
    defaultValues: {
      name: userData.name ?? '',
      email: userData.email ?? '',
      avatarUrl: userData.user_avatar ? userData.user_avatar : (userData.avatarUrl ?? '')
    }
  })

  const onSubmit = (data: z.infer<ReturnType<typeof userSchema>>) => {
    startTransition(async () => {
      let avatarUrl = previewUrl || ''

      // Handle file upload if a new file is selected
      if (file) {
        const uploadedUrl = await uploadAvatarToSupabase(file)

        if (uploadedUrl) {
          avatarUrl = uploadedUrl

          // If there's an old avatar, remove it
          if (currentAvatarUrl) await removeAvatarFromSupabase(currentAvatarUrl)
        } else {
          console.error('Avatar upload failed.')

          return
        }
      }

      // If the avatar is removed from the UI
      if (!previewUrl && currentAvatarUrl) {
        await removeAvatarFromSupabase(currentAvatarUrl)
        avatarUrl = ''
      }

      const { error } = await updateUserProfile({
        email: data.email,
        data: {
          name: data.name,
          full_name: data.name,
          email: data.email,
          user_avatar: avatarUrl
        }
      })

      if (error) {
        error.message === 'Error updating user' && userData.provider === 'google' && userData.email !== data.email
          ? toast('error', 'Cannot change email address as it is connected to Google')
          : toast('error', error.message)

        return
      }

      router.refresh()

      // Update the current avatar URL
      setCurrentAvatarUrl(avatarUrl)
      toast(
        'success',
        t(
          userData.email === data.email
            ? 'packages-profile:updateSuccessMessage'
            : 'packages-profile:updateSuccessMessageEmailChanged'
        )
      )
    })
  }

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='text-textPrimary text-lg font-medium'>
          <Trans i18nKey='packages-profile:personalInfoTitle' />
        </h3>
        <p className='text-textSecondary text-sm'>
          <Trans i18nKey='packages-profile:personalInfoDescription' />
        </p>
      </div>
      <Card>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className='pbs-6 grid gap-6 lg:grid-cols-3'>
              <div className='flex flex-col items-start gap-2'>
                <span className='font-medium'>
                  <Trans i18nKey='packages-profile:avatarLabel' />
                </span>
                <div
                  {...getRootProps({
                    className:
                      'dropzone select-none max-lg:self-center bs-32 is-32 border rounded-full cursor-pointer relative'
                  })}
                >
                  <input {...getInputProps()} id='avatarUrl' name='avatarUrl' />
                  {previewUrl ? (
                    <>
                      <img
                        alt='Avatar'
                        className='single-file-image bs-full is-full rounded-full object-cover'
                        src={previewUrl}
                        width={126}
                        height={126}
                      />
                      <Button
                        variant='destructive'
                        size='icon'
                        type='button'
                        className='block-end-[76%] inline-end-1 !is-6 !bs-6 absolute rounded-full'
                        onClick={e => {
                          e.stopPropagation()
                          setFiles(null)
                          setPreviewUrl(null)
                        }}
                      >
                        <TbX className='size-4' />
                      </Button>
                    </>
                  ) : (
                    <div className='bs-full flex flex-col items-center justify-center rounded-full p-3 text-center text-sm'>
                      <Trans i18nKey='packages-profile:avatarDropzoneText' />{' '}
                      <span className='text-primary'>
                        <Trans i18nKey='packages-profile:avatarBrowseText' />
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className='flex flex-col gap-6 lg:col-span-2'>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem className='is-full'>
                      <FormLabel htmlFor='name' className='mbe-2 block text-sm font-medium'>
                        <Trans i18nKey='packages-profile:nameLabel' />
                      </FormLabel>
                      <FormControl>
                        <Input id='name' type='text' {...field} />
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
                        <Trans i18nKey='packages-profile:emailLabel' />
                      </FormLabel>
                      <FormControl>
                        <Input id='email' type='email' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
            <CardFooter className='sm:justify-end'>
              <Button type='submit' disabled={pending}>
                {pending ? (
                  <Trans i18nKey='packages-profile:updatingText' />
                ) : (
                  <Trans i18nKey='packages-profile:updateButton' />
                )}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}

export default PersonalInformation
