import { z } from 'zod'
import type { Provider } from '@supabase/supabase-js'

const providers: z.ZodType<Provider> = z.enum([
  'apple',
  'azure',
  'bitbucket',
  'discord',
  'facebook',
  'figma',
  'github',
  'gitlab',
  'google',
  'kakao',
  'keycloak',
  'linkedin',
  'linkedin_oidc',
  'notion',
  'slack',
  'slack_oidc',
  'spotify',
  'twitch',
  'twitter',
  'workos',
  'zoom',
  'fly'
])

const AuthConfigSchema = z.object({
  providers: z.object({
    password: z.boolean({ description: 'Enable password while authenticating' }),
    magicLink: z.boolean({ description: 'Enable magic link while authenticating' }),
    oAuth: providers.array()
  })
})

const authConfig = AuthConfigSchema.parse({
  providers: {
    password: process.env.NEXT_PUBLIC_AUTH_PASSWORD === 'true',
    magicLink: process.env.NEXT_PUBLIC_AUTH_MAGIC_LINK === 'true',
    oAuth: ['google']
  }
} satisfies z.infer<typeof AuthConfigSchema>)

export default authConfig
