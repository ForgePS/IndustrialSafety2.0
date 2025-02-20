// React Imports
import type { ReactNode } from 'react'

// Third-party Imports
import Trans from '@repo/i18n/Trans'
import type * as Icons from 'react-icons/tb'

export interface SearchDataItem {
  id: string
  name: ReactNode
  url?: string
  dynamicUrl?: boolean // Flag to indicate if URL should be constructed based on role
  baseUrl?: string // Base URL path without /admin or /dashboard prefix
  icon: keyof typeof Icons
  permission?: string
  adminRoute?: boolean // Indicates if this is an admin route (for URL construction)
  openInNewTab?: boolean // Indicates if the link should open in a new tab
}

export const searchData: SearchDataItem[] = [
  {
    id: '1',
    name: <Trans i18nKey='data:searchDashboard' />,
    baseUrl: '',
    dynamicUrl: true,
    icon: 'TbDashboard'
  },
  {
    id: '2',
    name: <Trans i18nKey='data:searchMyProfile' />,
    baseUrl: '/my-profile',
    dynamicUrl: true,
    icon: 'TbUser'
  },
  {
    id: '3',
    name: <Trans i18nKey='data:searchGeneralSettings' />,
    url: '/admin/settings/general-settings',
    icon: 'TbSettings',
    permission: 'view_settings',
    adminRoute: true
  },
  {
    id: '4',
    name: <Trans i18nKey='data:searchPaymentProviders' />,
    url: '/admin/settings/payment-providers',
    icon: 'TbWallet',
    permission: 'view_settings',
    adminRoute: true
  },
  {
    id: '5',
    name: <Trans i18nKey='data:searchUsers' />,
    url: '/admin/users',
    icon: 'TbUsers',
    permission: 'view_users',
    adminRoute: true
  },
  {
    id: '6',
    name: <Trans i18nKey='data:searchRoles' />,
    url: '/admin/roles',
    icon: 'TbCrown',
    permission: 'view_roles',
    adminRoute: true
  },
  {
    id: '7',
    name: <Trans i18nKey='data:searchPermissions' />,
    url: '/admin/permissions',
    icon: 'TbLock',
    permission: 'view_permission',
    adminRoute: true
  },
  {
    id: '8',
    name: <Trans i18nKey='data:searchFaqCategories' />,
    url: '/admin/faqs/category',
    icon: 'TbLayoutGridAdd',
    permission: 'view_faqs',
    adminRoute: true
  },
  {
    id: '9',
    name: <Trans i18nKey='data:searchFaqs' />,
    url: '/admin/faqs/faq',
    icon: 'TbListDetails',
    permission: 'view_faqs',
    adminRoute: true
  },
  {
    id: '10',
    name: <Trans i18nKey='data:searchPlatformReviews' />,
    url: '/admin/reviews/platform',
    icon: 'TbTemplate',
    permission: 'view_reviews',
    adminRoute: true
  },
  {
    id: '11',
    name: <Trans i18nKey='data:searchReviews' />,
    url: '/admin/reviews/review',
    icon: 'TbStar',
    permission: 'view_reviews',
    adminRoute: true
  },
  {
    id: '14',
    name: <Trans i18nKey='data:searchBilling' />,
    url: '/billing',
    icon: 'TbWallet'
  },
  {
    id: '15',
    name: <Trans i18nKey='data:searchLandingPage' />,
    url: '/',
    icon: 'TbHome'
  }
]
