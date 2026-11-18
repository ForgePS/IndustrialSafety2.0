import type { DotRecordValues } from '../actions'

/**
 * A blank DOT record. Kept out of DotRecordForm ('use client'): a server page that imports a value from a
 * client module gets a client reference, not the object, so spreading it there yields nothing.
 */
export const EMPTY_DOT_RECORD: DotRecordValues = {
  category: 'roadside_inspection',
  title: '',
  record_date: '',
  due_on: '',
  personnel_id: '',
  location_id: '',
  description: '',
  outcome: ''
}
