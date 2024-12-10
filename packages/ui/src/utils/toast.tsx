// Third-party Imports
import { toast as sonnerToast } from 'sonner'
import type { ToastT } from 'sonner'
import { TbX } from 'react-icons/tb'

export const toast = (type: ToastT['type'], message: string) => {
  // @ts-ignore
  sonnerToast[type](message, {
    cancel: {
      label: <TbX />,
      onClick: () => {}
    },
    duration: 3000
  })
}
