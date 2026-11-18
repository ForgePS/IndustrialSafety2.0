'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'

import { QR_ACCESS_MODE_HELP } from '@/lib/forgeQrDestination'
import { SCAN_ACCESS_MODES, SCAN_ACCESS_MODE_LABELS, SCAN_FREQUENCIES, SCAN_FREQUENCY_LABELS } from '@/lib/forgeScanRules'
import type { QrActionConfig, ScanAccessMode, ScanFrequency } from '@/lib/forgeScanRules'

export type QrOption = { id: string; label: string }

type Toggle = {
  key: 'reportIssue' | 'markOutOfService' | 'returnToService' | 'employeeReturnToService' | 'outOfServiceOnFailedInspection' | 'history' | 'lotoView'
  label: string
  help: string

  /** Equipment-only toggles (hidden on location, form and vehicle QRs). */
  assetOnly?: boolean

  /** Service status / history toggles: shown on equipment and vehicle QRs. */
  serviceTarget?: boolean
  vehicleLabel?: string
  vehicleHelp?: string
}

const TOGGLES: Toggle[] = [
  { key: 'reportIssue', label: 'Report an issue', help: 'Anyone allowed to use the menu can report a problem. Each report creates a Corrective Action.' },
  {
    key: 'markOutOfService',
    label: 'Mark out of service',
    help: 'Lets people tag this equipment out so nobody uses it until it is fixed.',
    serviceTarget: true,
    vehicleHelp: 'Lets people tag this vehicle out so nobody drives it until it is fixed.'
  },
  {
    key: 'returnToService',
    label: 'Return to service',
    help: 'Signed-in users with permission can put the equipment back in service.',
    serviceTarget: true,
    vehicleHelp: 'Signed-in users with permission can put the vehicle back in service.'
  },
  {
    key: 'employeeReturnToService',
    label: 'Employees can return to service',
    help: 'Anyone who enters a valid employee number can return this equipment to service. Leave off if only supervisors should do that.',
    serviceTarget: true,
    vehicleHelp: 'Anyone who enters a valid employee number can return this vehicle to service. Leave off if only supervisors should do that.'
  },
  {
    key: 'outOfServiceOnFailedInspection',
    label: 'Failed inspection marks it out of service',
    help: 'When an inspection started from this QR has a failed item, the equipment is tagged out automatically.',
    assetOnly: true
  },
  {
    key: 'history',
    label: 'Equipment history',
    help: 'Shows recent inspections, issues and service status changes.',
    serviceTarget: true,
    vehicleLabel: 'Vehicle history',
    vehicleHelp: 'Shows recent DVIRs, maintenance, issues and service status changes.'
  },
  { key: 'lotoView', label: 'Lockout / Tagout procedure', help: 'Shows the approved LOTO procedure when this equipment has one.', assetOnly: true }
]

const selectClass = 'border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

const QrScanSettingsFields = ({
  targetType,
  accessMode,
  config,
  inspectionTemplates,
  forms,
  disabled,
  onAccessModeChange,
  onConfigChange
}: {
  targetType: string
  accessMode: ScanAccessMode
  config: QrActionConfig
  inspectionTemplates: QrOption[]
  forms: QrOption[]
  disabled: boolean
  onAccessModeChange: (value: ScanAccessMode) => void
  onConfigChange: (value: QrActionConfig) => void
}) => {
  const isAsset = targetType === 'asset'
  const isVehicle = targetType === 'vehicle'
  const visible = (toggle: Toggle) => (toggle.assetOnly ? isAsset : toggle.serviceTarget ? isAsset || isVehicle : true)
  const set = (patch: Partial<QrActionConfig>) => onConfigChange({ ...config, ...patch })

  const setTemplate = (frequency: ScanFrequency, id: string) => {
    const next = { ...config.inspectionTemplates }

    if (id) next[frequency] = id
    else delete next[frequency]
    set({ inspectionTemplates: next })
  }

  const toggleForm = (id: string, on: boolean) =>
    set({ formTemplateIds: on ? Array.from(new Set([...config.formTemplateIds, id])) : config.formTemplateIds.filter(item => item !== id) })

  // A template or form saved earlier but no longer active still shows, so saving does not silently drop it.
  const templateOptions = (selected?: string) =>
    selected && !inspectionTemplates.some(item => item.id === selected)
      ? [...inspectionTemplates, { id: selected, label: 'Inactive template' }]
      : inspectionTemplates

  const formOptions = [
    ...forms,
    ...config.formTemplateIds.filter(id => !forms.some(item => item.id === id)).map(id => ({ id, label: 'Unpublished form' }))
  ]

  return (
    <>
      <Card data-qr-access>
        <CardHeader>
          <CardTitle>Who can use this QR code</CardTitle>
          <CardDescription>Decides who can use the scan menu after scanning.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3' role='radiogroup' aria-label='Who can use this QR code'>
          {SCAN_ACCESS_MODES.map(mode => (
            <label key={mode} className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
              <input
                type='radio'
                name='qr-access-mode'
                value={mode}
                className='mt-1'
                checked={accessMode === mode}
                disabled={disabled}
                onChange={() => onAccessModeChange(mode)}
              />
              <span>
                <span className='block font-medium'>{SCAN_ACCESS_MODE_LABELS[mode]}</span>
                <span className='text-textSecondary block text-sm'>{QR_ACCESS_MODE_HELP[mode]}</span>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card data-qr-actions>
        <CardHeader>
          <CardTitle>Scan menu actions</CardTitle>
          <CardDescription>
            What people can do from the scan menu.
            {isAsset ? '' : isVehicle ? ' LOTO and failed-inspection settings only apply to equipment QR codes.' : ' Service status, history and LOTO only apply to equipment and vehicle QR codes.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-6'>
          <div className='grid gap-3 md:grid-cols-2'>
            {TOGGLES.filter(visible).map(toggle => (
              <label key={toggle.key} className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
                <input
                  type='checkbox'
                  className='mt-1'
                  checked={config[toggle.key]}
                  disabled={disabled}
                  onChange={event => set({ [toggle.key]: event.target.checked } as Partial<QrActionConfig>)}
                />
                <span>
                  <span className='block font-medium'>{(isVehicle && toggle.vehicleLabel) || toggle.label}</span>
                  <span className='text-textSecondary block text-sm'>{(isVehicle && toggle.vehicleHelp) || toggle.help}</span>
                </span>
              </label>
            ))}
          </div>

          {isVehicle ? (
            <div className='rounded-lg border p-3' data-qr-vehicle-dvir-note>
              <div className='font-medium'>Inspections: pre-trip and post-trip DVIRs</div>
              <p className='text-textSecondary text-sm'>
                Vehicle QR codes do not use daily, weekly or monthly checklists. For DOT-regulated vehicles the scan menu offers the pre-trip and post-trip Driver
                Vehicle Inspection Report instead, unless the vehicle is out of service. Turn DOT regulation on or off on the vehicle record.
              </p>
            </div>
          ) : targetType !== 'form' ? (
            <div>
              <div className='font-medium'>Inspections</div>
              <p className='text-textSecondary text-sm'>Pick a checklist for each inspection people should be able to start from this QR. Leave blank to hide it.</p>
              <div className='mt-3 grid gap-4 md:grid-cols-3'>
                {SCAN_FREQUENCIES.map(frequency => (
                  <div key={frequency}>
                    <Label htmlFor={'qr-inspection-' + frequency}>{SCAN_FREQUENCY_LABELS[frequency]} inspection</Label>
                    <select
                      id={'qr-inspection-' + frequency}
                      className={selectClass + ' mt-2'}
                      value={config.inspectionTemplates[frequency] || ''}
                      disabled={disabled}
                      onChange={event => setTemplate(frequency, event.target.value)}
                    >
                      <option value=''>No {SCAN_FREQUENCY_LABELS[frequency].toLowerCase()} inspection</option>
                      {templateOptions(config.inspectionTemplates[frequency]).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className='font-medium'>Linked forms</div>
            <p className='text-textSecondary text-sm'>Published forms offered as &quot;Fill out&quot; buttons. People must sign in to fill out a form.</p>
            {formOptions.length ? (
              <div className='mt-3 grid gap-2 md:grid-cols-2' data-qr-linked-forms>
                {formOptions.map(item => (
                  <label key={item.id} className='flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2'>
                    <input
                      type='checkbox'
                      checked={config.formTemplateIds.includes(item.id)}
                      disabled={disabled}
                      onChange={event => toggleForm(item.id, event.target.checked)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className='text-textSecondary mt-2 text-sm'>No published forms yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export default QrScanSettingsFields
