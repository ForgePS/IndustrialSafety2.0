'use client'

// Third-party Imports
import { useDropzone } from 'react-dropzone'
import { TbX } from 'react-icons/tb'
import { Label } from '@repo/ui/components/ui/label'
import { Button } from '@repo/ui/components/ui/button'

type ReviewImageProps = {
  onImageUpload: (file: string) => void
  file: File | undefined
  setFile: (File: File | undefined) => void
}

const ReviewImage: React.FC<ReviewImageProps> = ({ onImageUpload, file, setFile }) => {
  const { getRootProps, getInputProps } = useDropzone({
    multiple: false,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif']
    },
    onDrop: async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]

      if (file) {
        setFile(file)

        // Convert file to Base64
        const reader = new FileReader()

        reader.readAsDataURL(file)

        reader.onloadend = () => {
          const base64String = reader.result as string

          onImageUpload(base64String)
        }
      }
    }
  })

  return (
    <div className='flex flex-col items-start gap-2'>
      <Label htmlFor='reviewer-image'>Reviewer Image</Label>
      <div
        {...getRootProps({
          className: 'dropzone select-none self-center bs-32 is-32 border rounded-full cursor-pointer relative'
        })}
      >
        <input {...getInputProps()} id='reviewer-image' name='reviewer-image' />
        {file ? (
          <>
            <img
              alt={file.name}
              className='single-file-image bs-full is-full rounded-full object-cover'
              src={URL.createObjectURL(file)}
            />
            <Button
              variant='destructive'
              size='icon'
              className='block-end-[76%] inline-end-1 !is-6 !bs-6 absolute rounded-full'
              onClick={e => {
                e.stopPropagation()
                setFile(undefined)
                onImageUpload('')
              }}
            >
              <TbX className='size-4' />
            </Button>
          </>
        ) : (
          <>
            <div className='bs-full flex flex-col items-center justify-center rounded-full p-3 text-center text-sm'>
              Drag & Drop your files or <span className='text-primary'>Browse</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ReviewImage
