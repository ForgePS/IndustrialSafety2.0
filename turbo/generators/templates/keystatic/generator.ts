// Third-party Imports
import { execSync } from 'node:child_process'
import type { PlopTypes } from '@turbo/gen'

export function keystaticAdminGenerator(plop: PlopTypes.NodePlopAPI) {
  return plop.setGenerator('keystatic', {
    description: 'Generate a the admin for Keystatic',
    prompts: [],
    actions: [
      {
        type: 'add',
        path: 'apps/web/src/app/keystatic/layout.tsx',
        templateFile: 'templates/keystatic/layout.tsx.hbs'
      },
      {
        type: 'add',
        path: 'apps/web/src/app/keystatic/[[...params]]/page.tsx',
        templateFile: 'templates/keystatic/page.tsx.hbs'
      },
      {
        type: 'add',
        path: 'apps/web/src/app/api/keystatic/[...params]/route.ts',
        templateFile: 'templates/keystatic/route.ts.hbs'
      },
      {
        type: 'modify',
        path: 'packages/supabase/src/middleware.ts',
        async transform(content) {
          const updatedContent = content
            .replace(
              /if \(url\.pathname\.startsWith\('\/admin'\)\)/g,
              "if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/keystatic'))"
            )
            .replace(
              /request\.nextUrl\.pathname\.startsWith\('\/admin'\) \|\|[\s\n]+request\.nextUrl\.pathname\.startsWith\('\/dashboard'\)/g,
              "request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/dashboard') || request.nextUrl.pathname.startsWith('/keystatic')"
            )

          return updatedContent
        }
      },
      async () => {
        execSync('prettier --write packages/supabase/src/middleware.ts', {
          stdio: 'inherit'
        })

        return `Keystatic admin generated!`
      }
    ]
  })
}
