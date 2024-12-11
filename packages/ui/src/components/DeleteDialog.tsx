// Third-party Imports
import { TbBoxModel, TbTrash } from 'react-icons/tb'

// Component Imports
import { Button } from '@repo/ui/components/ui/button'
import type { ButtonProps } from '@repo/ui/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogFooter,
  DialogClose,
  DialogTitle,
  DialogDescription
} from '@repo/ui/components/ui/dialog'
import { Avatar, AvatarFallback } from '@repo/ui/components/ui/avatar'

const DeleteDialog = ({
  handleDelete,
  variant = 'destructive'
}: {
  handleDelete: () => void
  variant?: ButtonProps['variant']
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <TbTrash />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className='is-[380px]'>
        <DialogTitle hidden />
        <DialogDescription className='flex flex-col items-center gap-y-3'>
          <Avatar shape='circle' size='3xl' className='bg-destructive/20 text-destructive'>
            <AvatarFallback>
              <TbBoxModel className='bs-6 is-6' />
            </AvatarFallback>
          </Avatar>
          <span className='text-textPrimary text-lg font-medium'>Delete review</span>
          <span className='text-textSecondary text-center'>Are you sure you would like to do this?</span>
        </DialogDescription>
        <DialogFooter className='sm:justify-center'>
          <DialogClose asChild>
            <Button variant='tonalDefault' className='is-full'>
              Cancel
            </Button>
          </DialogClose>
          <Button variant='destructive' className='is-full' onClick={() => handleDelete()}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteDialog
