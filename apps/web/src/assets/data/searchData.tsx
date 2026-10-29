// Third-party Imports
import type * as Icons from 'react-icons/tb'

export type SearchDataItem = {
  id: string
  name: string // name should be a i18n key from the data.json file
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
    name: 'data:searchDashboard',
    baseUrl: '',
    dynamicUrl: true,
    icon: 'TbDashboard'
  },
  {
    id: '2',
    name: 'data:searchMyProfile',
    url: '/my-profile',
    icon: 'TbUser'
  }
]
