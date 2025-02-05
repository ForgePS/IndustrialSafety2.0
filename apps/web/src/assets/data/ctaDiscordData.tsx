// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'
import Trans from '@repo/i18n/Trans'

const data = {
  image: {
    srcLight: '/images/pages/discord-server-light.png',
    srcDark: '/images/pages/discord-server-dark.png'
  },
  title: <Trans i18nKey='data:discordTitle' />,
  description: <Trans i18nKey='data:discordDescription' />,
  button: (
    <Button size='lg'>
      <Trans i18nKey='data:discordButton' />
    </Button>
  )
}

export default data
