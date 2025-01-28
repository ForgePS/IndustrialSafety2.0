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
        path: 'apps/web/src/components/layout/vertical/Sidebar.tsx',
        async transform(content) {
          // Add required imports
          const importsUpdate = content.replace(/(} from 'react-icons\/tb')/, ', TbClipboardList $1')

          // Add the Blog section after Reviews section
          const updatedContent = importsUpdate.replace(
            /(<PermissionGuard permissions={permissions} permission='view_reviews'>.*?<\/PermissionGuard>)/s,
            `$1
            {process.env.NODE_ENV !== 'production' && (
              <PermissionGuard permissions={permissions} permission='manage_blog_section'>
                <SidebarMenuItem>
                  <MenuButton href='/keystatic' target='_blank' tooltip={t('layout:blog')}>
                    <TbClipboardList />
                    <span>
                      <Trans i18nKey='layout:blog' />
                    </span>
                  </MenuButton>
                  <SidebarMenuAction className='pointer-events-none hover:bg-transparent [&>svg]:size-5'>
                    <TbExternalLink />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              </PermissionGuard>
            )}`
          )

          return updatedContent
        }
      },
      {
        type: 'modify',
        path: 'packages/supabase/src/middleware.ts',
        async transform(content) {
          const updatedContent = content
            .replace(
              /(request\.nextUrl\.pathname\.startsWith\('\/admin'\) \|\|[\s\n]+request\.nextUrl\.pathname\.startsWith\('\/dashboard'\))/g,
              "$1 || request.nextUrl.pathname.startsWith('/keystatic')"
            )
            .replace(
              /(if \(.*?, 'view_reviews'\)\) {.*?})/s,
              `$1

    if (url.pathname.startsWith('/keystatic') && !hasPermission(permissions, 'manage_blog_section')) {
      url.pathname = '/not-authorized'

      return NextResponse.redirect(url)
    }`
            )

          return updatedContent
        }
      },
      async () => {
        execSync(
          'prettier --write apps/web/src/components/layout/vertical/Sidebar.tsx packages/supabase/src/middleware.ts',
          {
            stdio: 'inherit'
          }
        )

        return `Keystatic admin generated!`
      }
    ]
  })
}
