// Type Imports
import type { SearchDataItem } from '@/assets/data/searchData'

// Data
import { searchData } from '@/assets/data/searchData'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getSearchData = (permissions: string[] = []): SearchDataItem[] => {
  // Return all search data - permissions will be handled by RBAC in Search
  return searchData
}
