// Types
import type * as Icons from 'react-icons/tb'

export interface SearchDataItem {
  id: string
  name: string
  url?: string
  dynamicUrl?: boolean // Flag to indicate if URL should be constructed based on role
  baseUrl?: string // Base URL path without /admin or /dashboard prefix
  icon: keyof typeof Icons
  permission?: string
  adminRoute?: boolean // Indicates if this is an admin route (for URL construction)
}

export const searchData: SearchDataItem[] = [
  {
    id: '1',
    name: 'Dashboard',
    baseUrl: '',
    dynamicUrl: true,
    icon: 'TbDashboard'
  },
  {
    id: '2',
    name: 'My Profile',
    baseUrl: '/my-profile',
    dynamicUrl: true,
    icon: 'TbUser'
  },
  {
    id: '3',
    name: 'General Settings',
    url: '/admin/settings/general-settings',
    icon: 'TbSettings',
    permission: 'view_settings',
    adminRoute: true
  },
  {
    id: '4',
    name: 'Payment Providers',
    url: '/admin/settings/payment-providers',
    icon: 'TbWallet',
    permission: 'view_settings',
    adminRoute: true
  },
  {
    id: '5',
    name: 'Users',
    url: '/admin/users',
    icon: 'TbUsers',
    permission: 'view_users',
    adminRoute: true
  },
  {
    id: '6',
    name: 'Roles',
    url: '/admin/roles',
    icon: 'TbCrown',
    permission: 'view_roles',
    adminRoute: true
  },
  {
    id: '7',
    name: 'Permissions',
    url: '/admin/permissions',
    icon: 'TbLock',
    permission: 'view_permission',
    adminRoute: true
  },
  {
    id: '8',
    name: 'FAQ Categories',
    url: '/admin/faqs/category',
    icon: 'TbLayoutGridAdd',
    permission: 'view_faqs',
    adminRoute: true
  },
  {
    id: '9',
    name: 'FAQs',
    url: '/admin/faqs/faq',
    icon: 'TbListDetails',
    permission: 'view_faqs',
    adminRoute: true
  },
  {
    id: '10',
    name: 'Platform Reviews',
    url: '/admin/reviews/platform',
    icon: 'TbTemplate',
    permission: 'view_reviews',
    adminRoute: true
  },
  {
    id: '11',
    name: 'Reviews',
    url: '/admin/reviews/review',
    icon: 'TbStar',
    permission: 'view_reviews',
    adminRoute: true
  },
  {
    id: '14',
    name: 'Billing',
    url: '/dashboard/billing',
    icon: 'TbWallet'
  },
  {
    id: '15',
    name: 'Landing Page',
    url: '/',
    icon: 'TbHome'
  }
]
