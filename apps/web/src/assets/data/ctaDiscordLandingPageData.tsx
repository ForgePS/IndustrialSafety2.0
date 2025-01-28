// Next Imports
import Link from 'next/link'

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
    <Button size='lg' asChild>
      <Link href='https://discord.com/invite/kBHkY7DekX' target='_blank'>
        <Trans i18nKey='data:discordButton' />
      </Link>
    </Button>
  )
}

export default data
