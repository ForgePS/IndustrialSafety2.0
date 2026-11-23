import type { PermitType } from '@/lib/forgePermitRules'
import { ELECTRICAL_JUSTIFICATIONS, FALL_PROTECTION, HOT_WORK_TYPES, SPACE_HAZARDS } from '@/lib/forgePermitRules'

/** Port slice 18: label/value rows for a permit's type-specific details (record page and print page). */
export const detailRows = (type: PermitType, d: Record<string, any>): { label: string; value: string }[] => {
  const yesNo = (value: unknown) => (value === true ? 'Yes' : value === false ? 'No' : '')

  if (type === 'confined_space') {
    return [
      { label: 'Rescue service', value: d.rescue_service || '' },
      { label: 'Communication', value: d.communication || '' },
      { label: 'Entry type', value: d.entry_type === 'vertical' ? 'Vertical' : d.entry_type === 'horizontal' ? 'Horizontal' : '' },
      { label: 'Other hazards for this entry', value: d.extra_hazards || '' }
    ]
  }

  if (type === 'hot_work') {
    return [
      { label: 'Kind of hot work', value: HOT_WORK_TYPES[d.work_type] || '' },
      { label: 'Gas test needed', value: yesNo(d.gas_test_required) },
      { label: 'Designated hot work area', value: d.designated_area ? 'Yes' : 'No' },
      { label: 'Fire extinguisher', value: d.extinguisher || '' }
    ]
  }

  if (type === 'heights') {
    return [
      { label: 'Working height', value: d.working_height_ft !== undefined ? `${d.working_height_ft} ft` : '' },
      { label: 'Fall protection', value: (Array.isArray(d.fall_protection) ? d.fall_protection : []).map((item: string) => FALL_PROTECTION[item] || item).join(', ') },
      { label: 'Anchorage', value: d.anchorage || '' },
      { label: 'Rescue plan', value: d.rescue_plan || '' },
      { label: 'Equipment', value: d.equipment || '' }
    ]
  }

  return [
    { label: 'Voltage', value: d.voltage !== undefined ? `${d.voltage} V` : '' },
    { label: 'Equipment', value: d.equipment || '' },
    { label: 'Why energized', value: ELECTRICAL_JUSTIFICATIONS[d.justification] || '' },
    { label: 'Explanation', value: d.justification_detail || '' },
    { label: 'Limited approach boundary', value: d.limited_approach || '' },
    { label: 'Restricted approach boundary', value: d.restricted_approach || '' },
    { label: 'Arc flash boundary', value: d.arc_flash_boundary || '' },
    { label: 'Incident energy', value: d.incident_energy !== undefined ? `${d.incident_energy} cal/cm²` : '' },
    { label: 'PPE category', value: d.ppe_category ? `Category ${d.ppe_category}` : '' },
    { label: 'PPE required', value: d.ppe || '' },
    { label: 'Lockout considered', value: d.loto_considered || '' }
  ]
}

export const hazardLabels = (hazards: string[] | null | undefined) => (hazards || []).map(item => SPACE_HAZARDS[item] || item).join(', ')

export const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className='text-textSecondary text-xs font-medium uppercase'>{label}</dt>
    <dd className='text-sm whitespace-pre-wrap'>{children || '—'}</dd>
  </div>
)
