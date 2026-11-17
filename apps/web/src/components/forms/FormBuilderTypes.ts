import type { FormField } from '@/lib/forgeFormRules'

/** Port slice 9 (piece A): props shared by the builder pages (server) and the builder (client). Types only. */

export type FormBuilderOption = { id: string; name: string }

export type FormBuilderInitial = {
  id: string | null
  title: string
  description: string
  category: string
  locationId: string
  divisionId: string
  status: 'draft' | 'active' | 'archived'
  currentVersion: number
  publishedAt: string | null
  unpublishedChanges: boolean
  fields: FormField[]
}
