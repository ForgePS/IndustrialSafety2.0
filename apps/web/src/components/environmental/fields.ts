import type { Field } from '@/components/environmental/FieldForm'
import { EVENT_TYPES, FREQUENCIES, GENERATOR_STATUSES, MEDIA, OBLIGATION_TYPES, PERMIT_STATUSES, PERMIT_TYPES, UNITS } from '@/lib/forgeEnvironmentalRules'

/** Port slice 17: field definitions for the Environmental Safety forms, and the section tabs. */

type Option = { id: string; name: string }

const pick = (list: readonly { key: string; label: string }[], blank?: string) => [...(blank ? [{ value: '', label: blank }] : []), ...list.map(item => ({ value: item.key, label: item.label }))]
const choose = (list: Option[], blank: string) => [{ value: '', label: blank }, ...list.map(item => ({ value: item.id, label: item.name }))]
const units = [{ value: '', label: 'Unit' }, ...UNITS.map(unit => ({ value: unit, label: unit }))]

export const environmentalTabs = [
  { key: 'overview', label: 'Overview', href: '/environmental' },
  { key: 'events', label: 'Events', href: '/environmental/events' },
  { key: 'permits', label: 'Permits', href: '/environmental/permits' },
  { key: 'obligations', label: 'Obligations', href: '/environmental/obligations' },
  { key: 'waste', label: 'Waste shipments', href: '/environmental/waste' }
]

export const permitFields = (locations: Option[], documents: Option[]): Field[] => [
  { name: 'title', label: 'Name', type: 'text', required: true, maxLength: 200, placeholder: 'Title V operating permit' },
  { name: 'permitType', label: 'Type', type: 'select', required: true, options: pick(PERMIT_TYPES, 'Pick one') },
  { name: 'permitNumber', label: 'Permit number', type: 'text', maxLength: 80 },
  { name: 'agency', label: 'Issuing agency', type: 'text', required: true, maxLength: 200 },
  { name: 'locationId', label: 'Location', type: 'select', required: true, options: choose(locations, 'Pick one') },
  { name: 'status', label: 'Status', type: 'select', required: true, options: pick(PERMIT_STATUSES) },
  { name: 'issuedOn', label: 'Issued', type: 'date' },
  { name: 'effectiveOn', label: 'Effective', type: 'date' },
  { name: 'expiresOn', label: 'Expires', type: 'date' },
  { name: 'documentId', label: 'Permit document (optional)', type: 'select', options: choose(documents, 'None') },
  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 5000 }
]

export const obligationFields = (locations: Option[], permits: Option[], members: Option[]): Field[] => [
  { name: 'title', label: 'What has to be done', type: 'text', required: true, maxLength: 200, placeholder: 'Quarterly stormwater sampling', wide: true },
  { name: 'obligationType', label: 'Type', type: 'select', required: true, options: pick(OBLIGATION_TYPES, 'Pick one') },
  { name: 'frequency', label: 'How often', type: 'select', required: true, options: pick(FREQUENCIES, 'Pick one') },
  { name: 'nextDueOn', label: 'Next due', type: 'date', required: true },
  { name: 'locationId', label: 'Location', type: 'select', required: true, options: choose(locations, 'Pick one') },
  { name: 'permitId', label: 'Permit (optional)', type: 'select', options: choose(permits, 'None') },
  { name: 'ownerUserId', label: 'Owner (optional)', type: 'select', options: choose(members, 'Nobody') },
  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000 }
]

export const completionFields: Field[] = [
  { name: 'completedOn', label: 'Done on', type: 'date', required: true },
  {
    name: 'result',
    label: 'Result',
    type: 'select',
    required: true,
    options: [
      { value: 'done', label: 'Done, no problems' },
      { value: 'issue', label: 'Done, a problem was found' }
    ]
  },
  { name: 'notes', label: 'Notes (needed when a problem was found)', type: 'textarea', maxLength: 2000 }
]

export const eventFields = (locations: Option[], permits: Option[]): Field[] => [
  { name: 'eventType', label: 'Type', type: 'select', required: true, options: pick(EVENT_TYPES, 'Pick one') },
  { name: 'occurredAt', label: 'When it happened', type: 'datetime', required: true },
  { name: 'locationId', label: 'Location', type: 'select', required: true, options: choose(locations, 'Pick one') },
  { name: 'permitId', label: 'Permit involved (optional)', type: 'select', options: choose(permits, 'None') },
  { name: 'substance', label: 'Substance', type: 'text', maxLength: 200, placeholder: 'Diesel fuel', showIf: { field: 'eventType', values: ['spill_release', 'exceedance', 'other'] } },
  { name: 'quantity', label: 'Quantity (estimate)', type: 'number', showIf: { field: 'eventType', values: ['spill_release', 'exceedance', 'other'] } },
  { name: 'unit', label: 'Unit', type: 'select', options: units, showIf: { field: 'eventType', values: ['spill_release', 'exceedance', 'other'] } },
  { name: 'contained', label: 'Fully contained', type: 'checkbox', showIf: { field: 'eventType', values: ['spill_release'] } },
  { name: 'media', label: 'Where it went', type: 'checkboxes', options: pick(MEDIA), showIf: { field: 'eventType', values: ['spill_release', 'exceedance', 'other'] } },
  { name: 'description', label: 'What happened', type: 'textarea', required: true, maxLength: 10000 },
  { name: 'immediateActions', label: 'What was done right away', type: 'textarea', maxLength: 5000 },
  { name: 'reportable', label: 'Reportable to an agency', type: 'checkbox', wide: true },
  { name: 'agencyName', label: 'Agency told', type: 'text', maxLength: 200, placeholder: 'National Response Center', showIf: { field: 'reportable', values: [true] } },
  { name: 'agencyNotifiedAt', label: 'When the agency was told', type: 'datetime', showIf: { field: 'reportable', values: [true] } },
  { name: 'agencyReference', label: 'Agency reference number', type: 'text', maxLength: 120, showIf: { field: 'reportable', values: [true] } }
]

export const actionFields = (personnel: Option[]): Field[] => [
  { name: 'title', label: 'What needs to be done', type: 'text', required: true, maxLength: 200, wide: true },
  { name: 'ownerPersonnelId', label: 'Owner', type: 'select', required: true, options: choose(personnel, 'Pick one') },
  { name: 'dueOn', label: 'Due', type: 'date', required: true },
  { name: 'description', label: 'Details (optional)', type: 'textarea', maxLength: 5000 }
]

export const shipmentFields = (locations: Option[]): Field[] => [
  { name: 'manifestNumber', label: 'Manifest tracking number', type: 'text', required: true, maxLength: 20, placeholder: '123456789JJK' },
  { name: 'shippedOn', label: 'Shipped', type: 'date', required: true },
  { name: 'locationId', label: 'Shipped from', type: 'select', required: true, options: choose(locations, 'Pick one') },
  { name: 'generatorStatus', label: 'Generator status', type: 'select', required: true, options: pick(GENERATOR_STATUSES, 'Pick one') },
  { name: 'wasteDescription', label: 'Waste', type: 'text', required: true, maxLength: 500, placeholder: 'Spent solvent', wide: true },
  { name: 'wasteCodes', label: 'Waste codes', type: 'text', maxLength: 200, placeholder: 'D001, F005' },
  { name: 'quantity', label: 'Quantity', type: 'number', required: true },
  { name: 'unit', label: 'Unit', type: 'select', required: true, options: units },
  { name: 'transporter', label: 'Transporter', type: 'text', required: true, maxLength: 200 },
  { name: 'facility', label: 'Receiving facility', type: 'text', required: true, maxLength: 200 },
  { name: 'returnReceivedOn', label: 'Signed copy received', type: 'date', help: 'The copy signed by the receiving facility.' },
  { name: 'exceptionFiledOn', label: 'Exception report filed', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 2000 }
]
