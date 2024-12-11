'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Image from 'next/image'

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
import SubmitButton from '@repo/ui/components/SubmitButton'
import { toast } from '@repo/ui/utils/toast'
import { uploadAvatarToSupabase, removeAvatarFromSupabase, updateUserProfile } from '@repo/profile/client'

// Define Zod Schema for validation
const userSchema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, { message: 'Email address is required.' }).email({
    message: 'Please enter a valid email address.'
  }),
  avatarUrl: z.string().optional()
})

const PersonalInformation = ({
  userData
}: {
  userData: { id: string; email: string; name: string; avatarUrl: string; user_avatar: string }
}) => {
  // States
  const [file, setFiles] = useState<File | null>(null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(
    userData.user_avatar ? userData.user_avatar : (userData.avatarUrl ?? '')
  )

  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(userData.user_avatar || '')

  // Hooks
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
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: userData.name ?? '',
      email: userData.email ?? '',
      avatarUrl: userData.user_avatar ? userData.user_avatar : (userData.avatarUrl ?? '')
    }
  })

  const onSubmit = async (data: z.infer<typeof userSchema>) => {
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
      console.error('Error updating user:', error)

      return
    }

    // Update the current avatar URL
    setCurrentAvatarUrl(avatarUrl)
    toast('success', 'User updated successfully')
  }

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      <div className='flex flex-col items-start gap-1'>
        <h3 className='text-textPrimary text-lg font-medium'>Personal Information</h3>
        <p className='text-textSecondary text-sm'>Manage your personal information.</p>
      </div>
      <Card>
        <Form {...form}>
          <form>
            <CardContent className='pbs-6 grid gap-6 lg:grid-cols-3'>
              <div className='flex flex-col items-start gap-2'>
                <span className='font-medium'>Avatar</span>
                <div
                  {...getRootProps({
                    className:
                      'dropzone select-none max-lg:self-center bs-32 is-32 border rounded-full cursor-pointer relative'
                  })}
                >
                  <input {...getInputProps()} id='avatarUrl' name='avatarUrl' />
                  {previewUrl ? (
                    <>
                      <Image
                        alt='Avatar'
                        className='single-file-image bs-full is-full rounded-full object-cover'
                        src={previewUrl}
                        width={126}
                        height={126}
                        priority
                        quality={100}
                      />
                      <Button
                        variant='destructive'
                        size='icon'
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
                      Drag & Drop your files or <span className='text-primary'>Browse</span>
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
                        Name
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
                        Email
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
              <SubmitButton formAction={form.handleSubmit(onSubmit) as any}>Update</SubmitButton>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  )
}

export default PersonalInformation
