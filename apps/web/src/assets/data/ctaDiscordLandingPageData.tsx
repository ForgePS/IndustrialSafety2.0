// Next Imports
import Link from 'next/link'

// Third-party Imports
import { Button } from '@repo/ui/components/ui/button'

const data = {
  image: {
    srcLight: '/images/pages/discord-server-light.png',
    srcDark: '/images/pages/discord-server-dark.png'
  },
  title: 'Join Our Community of Innovators',
  description:
    'Connect with other businesses using ChatFlow AI, share best practices, get tips from experts, and collaborate on enhancing customer support experiences.',
  button: (
    <Button size='lg' asChild>
      <Link href='https://discord.com/invite/kBHkY7DekX' target='_blank'>
        Join Our Community Now
      </Link>
    </Button>
  )
}

export default data
