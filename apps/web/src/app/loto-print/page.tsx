import type { Metadata } from 'next'
import Link from 'next/link'
import { createServiceRoleClient } from '@repo/supabase/server'

import LotoAnnotatedImage from '@/components/loto/LotoAnnotatedImage'
import LotoEnergyBadge from '@/components/loto/LotoEnergyBadge'
import { getLotoPhotos, lotoProcedureWithinScope, type LotoPhoto } from '@/lib/forgeLoto'
import { effectiveLotoContent, normalizePrecautions } from '@/lib/forgeLotoRules'
import { findOrCreateLotoQr } from '@/lib/forgeLotoServer'
import { getForgeQrScanUrl } from '@/lib/forgeQr'
import { generateForgeQrSvg } from '@/lib/forgeQrSvg'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import PrintButton from './PrintButton'

export const metadata: Metadata = { title: 'Print LOTO Procedures' }

const MAX_IDS = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PRINT_CSS = `
.loto-sheet { width: 8.5in; min-height: 11in; padding: 0.4in; margin: 0 auto 24px; background: #fff; color: #111; box-shadow: 0 1px 6px rgba(0,0,0,.15); font-size: 11px; }
.loto-sheet table { width: 100%; border-collapse: collapse; }
.loto-sheet th, .loto-sheet td { border: 1px solid #111; padding: 4px 6px; vertical-align: top; text-align: left; }
.loto-banner { font-weight: 800; text-align: center; padding: 6px; letter-spacing: .04em; }
@page { size: letter; margin: 0; }
@media print {
  body { background: #fff !important; }
  [data-print-hide] { display: none !important; }
  .loto-sheet { box-shadow: none; margin: 0; page-break-inside: avoid; }
  .loto-sheet + .loto-sheet { page-break-before: always; break-before: page; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`

const PhotoStrip = ({ photos, size }: { photos: LotoPhoto[]; size: 'large' | 'small' }) =>
  photos.length ? (
    <div className='flex flex-wrap gap-1'>
      {photos.map(photo =>
        photo.url ? (
          <figure key={photo.id} className='m-0'>
            <LotoAnnotatedImage
              src={photo.url}
              alt={photo.caption || photo.file_name}
              annotations={photo.annotations}
              imgClassName={size === 'large' ? 'max-h-[220px] object-contain' : 'max-h-[90px] object-contain'}
            />
            {photo.caption ? <figcaption className='text-[9px]'>{photo.caption}</figcaption> : null}
          </figure>
        ) : null
      )}
    </div>
  ) : null

const LotoPrintPage = async ({ searchParams }: { searchParams: Promise<{ ids?: string }> }) => {
  const context = await requireTenantPermission('loto.view')
  const organizationId = context.activeOrganization.id
  const { ids: raw } = await searchParams
  const ids = Array.from(new Set(String(raw || '').split(',').map(item => item.trim()).filter(item => UUID.test(item)))).slice(0, MAX_IDS)
  const supabase = createServiceRoleClient() as any
  const canCreateQr = context.access.effective.some(item => item.permissionKey === 'qr_management.create' && item.allowed)

  const { data: rows } = ids.length
    ? await supabase
        .from('forge_loto_procedures')
        .select('*, forge_assets(id, asset_number, name, locations(name), divisions(name)), forge_loto_energy_sources(*), forge_loto_steps(*)')
        .eq('organization_id', organizationId)
        .in('id', ids)
        .neq('status', 'retired')
    : { data: [] }

  const visible: any[] = []

  for (const row of rows || []) {
    if (await lotoProcedureWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, procedure: row })) visible.push(row)
  }

  visible.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))

  const photos = await getLotoPhotos({ organizationId, procedureIds: visible.map(item => item.id) })
  const qrByAsset = new Map<string, string | null>()

  for (const procedure of visible) {
    const asset = procedure.forge_assets

    if (asset && !qrByAsset.has(asset.id)) {
      qrByAsset.set(asset.id, await findOrCreateLotoQr({ organizationId, asset, userId: context.user.id, canCreate: canCreateQr }))
    }
  }

  const printedAt = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className='min-h-screen bg-slate-100 py-6'>
      <style>{PRINT_CSS}</style>
      <div data-print-hide className='mx-auto mb-4 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-2'>
        <div>
          <h1 className='text-xl font-bold text-slate-900'>Print LOTO procedures</h1>
          <p className='text-sm text-slate-600'>
            {visible.length} procedure{visible.length === 1 ? '' : 's'}, two pages each. Use letter paper and turn on background graphics.
          </p>
          {visible.length < ids.length ? (
            <p className='text-sm text-red-700'>{ids.length - visible.length} selected procedure(s) were left out: retired, missing, or outside your access.</p>
          ) : null}
        </div>
        <div className='flex gap-2'>
          <Link className='text-sm text-blue-700 underline' href='/loto'>Back to LOTO</Link>
          {visible.length ? <PrintButton /> : null}
        </div>
      </div>

      {!visible.length ? (
        <p className='text-center text-slate-700'>No procedures to print. Pick them from the LOTO list.</p>
      ) : null}

      {visible.map(procedure => {
        const asset = procedure.forge_assets || {}
        const content = effectiveLotoContent(procedure)
        const precautions = normalizePrecautions(procedure.precautions)
        const sources = [...(procedure.forge_loto_energy_sources || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        const steps = [...(procedure.forge_loto_steps || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
        const equipmentPhotos = photos.filter(photo => photo.procedure_id === procedure.id && !photo.energy_source_id)
        const token = asset.id ? qrByAsset.get(asset.id) : null
        const qrSvg = token ? generateForgeQrSvg(getForgeQrScanUrl(token), 3) : null

        const notes = [
          ...precautions.map(item => item.text),
          procedure.special_precautions,
          procedure.required_ppe ? 'Required PPE: ' + procedure.required_ppe : null
        ].filter(Boolean) as string[]

        return [
          <section key={procedure.id + '-1'} className='loto-sheet' data-loto-sheet>
            <table>
              <tbody>
                <tr>
                  <td colSpan={3} className='text-base font-extrabold'>
                    LOCKOUT / TAGOUT PROCEDURE
                    <div className='text-xs font-normal'>{procedure.title}</div>
                  </td>
                  <td rowSpan={4} className='w-[1.3in] text-center align-middle'>
                    {qrSvg ? (
                      <>
                        <div className='mx-auto w-[1.1in] [&_svg]:h-auto [&_svg]:w-full' dangerouslySetInnerHTML={{ __html: qrSvg }} />
                        <div className='text-[8px]'>Scan for current procedure</div>
                      </>
                    ) : (
                      <div className='text-[9px]'>No QR code. Someone with QR permission must print once to create it.</div>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className='w-[1.2in]'>Procedure #</th>
                  <td>{procedure.procedure_number}</td>
                  <td>Rev {procedure.revision_number || 1}{procedure.status !== 'approved' ? ' · ' + String(procedure.status).toUpperCase() + ' (not approved)' : ''}</td>
                </tr>
                <tr>
                  <th>Equipment</th>
                  <td>{asset.name || '—'}</td>
                  <td>{asset.asset_number || '—'}</td>
                </tr>
                <tr>
                  <th>Location</th>
                  <td>{asset.locations?.name || '—'}{asset.divisions?.name ? ' · ' + asset.divisions.name : ''}</td>
                  <td>Effective {procedure.effective_date || '—'} · Review {procedure.next_review_date || '—'}</td>
                </tr>
              </tbody>
            </table>

            <div className='loto-banner mt-2' style={{ background: '#dc2626', color: '#fff' }}>
              LOCKOUT POINT(S) — {sources.length} ENERGY SOURCE{sources.length === 1 ? '' : 'S'}
            </div>

            {notes.length ? (
              <div className='mt-2 border-2 border-red-600 p-2'>
                <div className='font-bold text-red-700'>NOTE</div>
                <ul className='ml-4 list-disc'>
                  {notes.map((text, index) => <li key={index}>{text}</li>)}
                </ul>
              </div>
            ) : null}

            {equipmentPhotos.length ? (
              <div className='mt-2' data-photo-strip>
                <PhotoStrip photos={equipmentPhotos} size='large' />
              </div>
            ) : null}

            <div className='loto-banner mt-2' style={{ background: '#111', color: '#fff' }}>ENERGY ISOLATION POINTS</div>
            <table>
              <thead>
                <tr>
                  <th className='w-8'>#</th>
                  <th className='w-14'>Energy</th>
                  <th>Isolation point and action</th>
                  <th className='w-[1.8in]'>Photo</th>
                  <th className='w-[1.6in]'>Verification</th>
                </tr>
              </thead>
              <tbody>
                {sources.length ? sources.map((source: any, index: number) => (
                  <tr key={source.id}>
                    <td className='font-bold'>{index + 1}</td>
                    <td><LotoEnergyBadge code={source.energy_code} energyType={source.energy_type} /></td>
                    <td>
                      <div className='font-semibold'>{source.source_name}{source.magnitude ? ' · ' + source.magnitude : ''}</div>
                      {source.isolation_location ? <div>Location: {source.isolation_location}</div> : null}
                      {source.isolation_device ? <div>Isolate: {source.isolation_device}</div> : null}
                      {source.lockout_device ? <div>Lock with: {source.lockout_device}</div> : null}
                      {source.stored_energy_method ? <div>Stored energy: {source.stored_energy_method}</div> : null}
                      {source.notes ? <div className='italic'>{source.notes}</div> : null}
                    </td>
                    <td>
                      <PhotoStrip photos={photos.filter(photo => photo.energy_source_id === source.id)} size='small' />
                    </td>
                    <td>{source.verification_method || 'Try to start; confirm zero energy.'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className='text-center'>No energy sources recorded.</td></tr>
                )}
              </tbody>
            </table>

            {steps.length ? (
              <table className='mt-2'>
                <thead>
                  <tr><th className='w-8'>Step</th><th>Lockout steps</th><th className='w-[1.8in]'>Verify</th></tr>
                </thead>
                <tbody>
                  {steps.map((step: any, index: number) => (
                    <tr key={step.id}>
                      <td className='font-bold'>{index + 1}</td>
                      <td>
                        <div className='font-semibold'>{step.title}</div>
                        {step.instructions ? <div>{step.instructions}</div> : null}
                        {step.warning_text ? <div className='font-semibold text-red-700'>⚠ {step.warning_text}</div> : null}
                      </td>
                      <td>{step.verification_required ? step.verification_instructions || 'Verification required' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <div className='mt-2 text-[9px] text-slate-600'>Printed {printedAt} · Page 1 of 2 · {procedure.procedure_number}</div>
          </section>,

          <section key={procedure.id + '-2'} className='loto-sheet' data-loto-sheet>
            <div className='text-base font-extrabold'>{procedure.procedure_number} · {procedure.title}</div>
            <h2 className='mt-3 font-bold'>PURPOSE</h2>
            <p className='whitespace-pre-line'>{content.purpose}</p>
            <h2 className='mt-3 font-bold'>SCOPE</h2>
            <p className='whitespace-pre-line'>{content.scope}</p>
            <h2 className='mt-3 font-bold text-red-700'>ENFORCEMENT</h2>
            <p className='whitespace-pre-line font-semibold text-red-700'>{content.enforcement}</p>

            <div className='loto-banner mt-3' style={{ background: '#dc2626', color: '#fff' }}>SEQUENCE OF LOCKOUT (SHUTDOWN)</div>
            <table>
              <tbody>
                {content.shutdownSequence.map((item, index) => (
                  <tr key={index}><td className='w-14 font-bold'>{item.step || index + 1}</td><td>{item.description}</td></tr>
                ))}
              </tbody>
            </table>

            <div className='loto-banner mt-3' style={{ background: '#16a34a', color: '#fff' }}>RESTORING EQUIPMENT TO SERVICE</div>
            <table>
              <tbody>
                {content.restoreSequence.map((item, index) => (
                  <tr key={index}><td className='w-14 font-bold'>{item.step || index + 1}</td><td>{item.description}</td></tr>
                ))}
              </tbody>
            </table>
            {procedure.restoration_notes ? <p className='mt-2 whitespace-pre-line'>{procedure.restoration_notes}</p> : null}

            <div className='mt-4 text-[9px] text-slate-600'>
              Based on OSHA 29 CFR 1910.147 Appendix A (typical minimal lockout procedure). Printed {printedAt} · Page 2 of 2 · {procedure.procedure_number}
            </div>
          </section>
        ]
      })}
    </div>
  )
}

export default LotoPrintPage
