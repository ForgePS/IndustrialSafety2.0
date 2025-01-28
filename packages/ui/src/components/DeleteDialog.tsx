// Third-party Imports
import { TbBoxModel, TbTrash } from 'react-icons/tb'
import Trans from '@repo/i18n/Trans'

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
  variant = 'destructive',
  itemName
}: {
  handleDelete: () => void
  variant?: ButtonProps['variant']
  itemName: string
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <TbTrash />
          <Trans i18nKey='packages-ui:deleteButton' />
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
          <span className='text-textPrimary text-lg font-medium'>
            <Trans i18nKey='packages-ui:deleteConfirmationTitle' values={{ itemName }} />
          </span>
          <span className='text-textSecondary text-center'>
            <Trans i18nKey='packages-ui:deleteConfirmationMessage' />
          </span>
        </DialogDescription>
        <DialogFooter className='sm:justify-center'>
          <DialogClose asChild>
            <Button variant='tonalDefault' className='is-full'>
              <Trans i18nKey='packages-ui:cancelButton' />
            </Button>
          </DialogClose>
          <Button variant='destructive' className='is-full' onClick={() => handleDelete()}>
            <Trans i18nKey='packages-ui:deleteButton' />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteDialog
