import Link from 'next/link'

import type { AreaStatus } from '@/lib/forgeWaypointRules'

/**
 * Forge Waypoint: the "Before you enter" brief for an area. Rendered on the public scan page for Area Card QRs
 * and as the preview on the area's Waypoint page. Server component; everything is passed in already checked.
 */

const STATUS_STYLES: Record<AreaStatus['level'], string> = {
  clear: 'border-green-600 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
  caution: 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  stop: 'border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100'
}

const DOT_STYLES: Record<AreaStatus['level'], string> = {
  clear: 'bg-green-600',
  caution: 'bg-amber-500',
  stop: 'bg-red-600'
}

const EQUIPMENT_STATUS: Record<string, string> = {
  active: 'In service',
  out_of_service: 'Out of service',
  maintenance: 'In maintenance',
  reserved: 'Reserved'
}

export type AreaBriefingEquipment = {
  id: string
  name: string
  assetNumber: string | null
  status: string
  lockedOut: boolean

  /** Scan page of the equipment's own QR, when it has an active scan-menu QR. */
  scanHref?: string | null
}

export const AreaStatusDot = ({ level, label }: { level: AreaStatus['level']; label: string }) => (
  <span className='inline-flex items-center gap-2' data-area-status={level}>
    <span className={'inline-block size-3 rounded-full ' + DOT_STYLES[level]} aria-hidden='true' />
    <span className='font-semibold'>{label}</span>
  </span>
)

const AreaBriefing = ({
  status,
  description,
  ppe,
  hazards,
  entryRequirements,
  restrictedEntry,
  emergency,
  emergencyNotes,
  equipment
}: {
  status: AreaStatus
  description: string | null
  ppe: { key: string; label: string }[]
  hazards: { key: string; label: string }[]
  entryRequirements: string | null
  restrictedEntry: boolean
  emergency: { label: string; value: string }[]
  emergencyNotes: string | null

  /** Null hides the equipment list (anonymous scanners). */
  equipment: AreaBriefingEquipment[] | null
}) => (
  <section className='flex flex-col gap-4' data-testid='area-briefing'>
    <div
      className={'rounded-lg border-l-4 p-4 ' + STATUS_STYLES[status.level]}
      data-testid='area-status'
      data-level={status.level}
    >
      <AreaStatusDot level={status.level} label={status.label} />
      {status.reasons.length ? (
        <ul className='mt-2 list-disc pl-5 text-sm'>
          {status.reasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className='mt-1 text-sm'>No lockouts, out-of-service equipment or open issues here right now.</p>
      )}
    </div>

    {description ? <p className='text-textSecondary text-sm'>{description}</p> : null}

    <div className='bg-card rounded-lg border p-4' data-testid='area-ppe'>
      <h2 className='text-textPrimary text-base font-bold'>Required PPE</h2>
      {ppe.length ? (
        <ul className='mt-2 flex flex-wrap gap-2'>
          {ppe.map(item => (
            <li key={item.key} className='rounded-full bg-blue-600 px-3 py-1 text-sm font-semibold text-white'>
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary mt-1 text-sm'>No PPE beyond the site standard.</p>
      )}
    </div>

    <div className='bg-card rounded-lg border p-4' data-testid='area-hazards'>
      <h2 className='text-textPrimary text-base font-bold'>Hazards</h2>
      {hazards.length ? (
        <ul className='mt-2 flex flex-wrap gap-2'>
          {hazards.map(item => (
            <li key={item.key} className='rounded-full border border-amber-500 px-3 py-1 text-sm font-semibold'>
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary mt-1 text-sm'>No area hazards listed.</p>
      )}
      {restrictedEntry || entryRequirements ? (
        <p className='mt-3 text-sm' data-testid='area-entry'>
          <span className='font-semibold'>{restrictedEntry ? 'Restricted entry. ' : 'Before entering: '}</span>
          {entryRequirements || 'Authorized people only.'}
        </p>
      ) : null}
    </div>

    {equipment ? (
      <div className='bg-card rounded-lg border p-4' data-testid='area-equipment'>
        <h2 className='text-textPrimary text-base font-bold'>Equipment in this area</h2>
        {equipment.length ? (
          <ul className='mt-2 divide-y'>
            {equipment.map(item => {
              const label = item.lockedOut ? 'Locked out' : EQUIPMENT_STATUS[item.status] || item.status
              const warn = item.lockedOut || item.status === 'out_of_service'

              return (
                <li
                  key={item.id}
                  className='flex items-center justify-between gap-3 py-2 text-sm'
                  data-area-equipment={item.id}
                >
                  <span>
                    {item.scanHref ? (
                      <Link href={item.scanHref} className='text-primary font-medium hover:underline'>
                        {item.name}
                      </Link>
                    ) : (
                      <span className='font-medium'>{item.name}</span>
                    )}
                    {item.assetNumber ? <span className='text-textSecondary'> · {item.assetNumber}</span> : null}
                  </span>
                  <span
                    className={
                      'shrink-0 rounded px-2 py-0.5 text-xs font-bold ' + (warn ? 'bg-red-600 text-white' : 'bg-muted')
                    }
                  >
                    {label}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className='text-textSecondary mt-1 text-sm'>No equipment has been placed in this area.</p>
        )}
      </div>
    ) : (
      <p className='text-textSecondary text-sm' data-testid='area-equipment-hidden'>
        Identify yourself to see the equipment in this area and its status.
      </p>
    )}

    <div className='bg-card rounded-lg border p-4' data-testid='area-emergency'>
      <h2 className='text-textPrimary text-base font-bold'>In an emergency</h2>
      {emergency.length ? (
        <dl className='mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm'>
          {emergency.map(row => (
            <div key={row.label} className='contents'>
              <dt className='text-textSecondary'>{row.label}</dt>
              <dd className='font-medium'>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className='text-textSecondary mt-1 text-sm'>Follow the site emergency plan.</p>
      )}
      {emergencyNotes ? <p className='mt-2 text-sm'>{emergencyNotes}</p> : null}
    </div>
  </section>
)

export default AreaBriefing
