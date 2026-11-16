import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import LotoAnnotatedImage from '@/components/loto/LotoAnnotatedImage'
import LotoEnergyBadge from '@/components/loto/LotoEnergyBadge'
import { getPublicLotoForAsset, type LotoPhoto } from '@/lib/forgeLoto'
import { effectiveLotoContent, normalizePrecautions } from '@/lib/forgeLotoRules'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'LOTO Procedures', robots: { index: false, follow: false } }

const Photos = ({ photos }: { photos: LotoPhoto[] }) =>
  photos.length ? (
    <div className='mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2'>
      {photos.map(photo =>
        photo.url ? (
          <figure key={photo.id} className='m-0 overflow-hidden rounded-md border bg-white'>
            <LotoAnnotatedImage src={photo.url} alt={photo.caption || photo.file_name} annotations={photo.annotations} imgClassName='w-full' className='w-full' />
            {photo.caption ? <figcaption className='px-2 py-1 text-xs text-slate-600'>{photo.caption}</figcaption> : null}
          </figure>
        ) : null
      )}
    </div>
  ) : null

/**
 * What a QR sticker on equipment opens, without signing in (1.0 behaviour). Shows approved
 * procedures only. No names, lockout history or review notes.
 */
const PublicLotoPage = async ({ params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params

  if (!/^[a-f0-9]{48}$/i.test(token)) redirect('/q/unavailable')

  const supabase = createServiceRoleClient() as any
  const { data } = await supabase.rpc('forge_resolve_qr_token', { p_token: token })
  const resolved = Array.isArray(data) ? data[0] : null

  if (!resolved || resolved.default_action !== 'loto_view' || resolved.target_type !== 'asset') redirect('/q/unavailable')

  const view = await getPublicLotoForAsset({ organizationId: resolved.organization_id, assetId: resolved.target_id })

  if (!view) redirect('/q/unavailable')

  const { asset, organizationName, procedures, photos } = view as any

  return (
    <main className='min-h-screen bg-slate-100 px-4 py-6 text-slate-900'>
      <div className='mx-auto flex max-w-3xl flex-col gap-4'>
        <header className='rounded-lg bg-red-600 p-4 text-white'>
          <p className='text-xs font-semibold uppercase tracking-wide'>{organizationName}</p>
          <h1 className='text-2xl font-extrabold'>Lockout / Tagout</h1>
          <p className='mt-1 text-sm'>
            {asset.name}
            {asset.asset_number ? ' · ' + asset.asset_number : ''}
            {asset.locations?.name ? ' · ' + asset.locations.name : ''}
          </p>
        </header>

        <p className='text-sm text-slate-700'>
          Read-only. Only authorized employees may apply locks.{' '}
          <Link className='font-semibold text-blue-700 underline' href='/auth/login'>Sign in</Link> to issue or work a lockout.
        </p>

        {!procedures.length ? (
          <div className='rounded-lg border bg-white p-6 text-center'>
            No approved LOTO procedure for this equipment. Do not service it; contact your supervisor.
          </div>
        ) : null}

        {procedures.map((procedure: any) => {
          const content = effectiveLotoContent(procedure)
          const precautions = normalizePrecautions(procedure.precautions)
          const equipmentPhotos = photos.filter((photo: LotoPhoto) => photo.procedure_id === procedure.id && !photo.energy_source_id)

          return (
            <article key={procedure.id} className='rounded-lg border bg-white p-4 shadow-sm' data-public-loto={procedure.procedure_number}>
              <div className='flex flex-wrap items-start justify-between gap-2'>
                <div>
                  <h2 className='text-lg font-bold'>{procedure.title}</h2>
                  <p className='text-xs text-slate-600'>
                    {procedure.procedure_number} · Rev {procedure.revision_number || 1} · Effective {procedure.effective_date || '—'}
                  </p>
                </div>
                {procedure.lockedOut ? (
                  <span className='rounded bg-red-600 px-2 py-1 text-xs font-bold text-white'>LOCKED OUT NOW</span>
                ) : null}
              </div>

              {precautions.length || procedure.special_precautions || procedure.required_ppe ? (
                <div className='mt-3 rounded-md border-2 border-red-600 p-3 text-sm'>
                  <div className='font-bold text-red-700'>Precautions</div>
                  <ul className='ml-4 list-disc'>
                    {precautions.map(item => <li key={item.key}>{item.text}</li>)}
                    {procedure.special_precautions ? <li>{procedure.special_precautions}</li> : null}
                    {procedure.required_ppe ? <li>Required PPE: {procedure.required_ppe}</li> : null}
                  </ul>
                </div>
              ) : null}

              <Photos photos={equipmentPhotos} />

              <h3 className='mt-4 font-bold'>Energy isolation points</h3>
              <ol className='mt-2 flex flex-col gap-3'>
                {procedure.forge_loto_energy_sources.map((source: any, index: number) => (
                  <li key={source.id} className='rounded-md border p-3 text-sm'>
                    <div className='flex items-center gap-2 font-semibold'>
                      <span>{index + 1}.</span>
                      <LotoEnergyBadge code={source.energy_code} energyType={source.energy_type} />
                      <span>{source.source_name}{source.magnitude ? ' · ' + source.magnitude : ''}</span>
                    </div>
                    {source.isolation_location ? <div className='mt-1'>Location: {source.isolation_location}</div> : null}
                    {source.isolation_device ? <div>Isolate: {source.isolation_device}</div> : null}
                    {source.lockout_device ? <div>Lock with: {source.lockout_device}</div> : null}
                    {source.stored_energy_method ? <div>Stored energy: {source.stored_energy_method}</div> : null}
                    {source.verification_method ? <div>Verify: {source.verification_method}</div> : null}
                    <Photos photos={photos.filter((photo: LotoPhoto) => photo.energy_source_id === source.id)} />
                  </li>
                ))}
              </ol>

              {procedure.forge_loto_steps.length ? (
                <>
                  <h3 className='mt-4 font-bold'>Steps</h3>
                  <ol className='ml-5 mt-2 list-decimal text-sm'>
                    {procedure.forge_loto_steps.map((step: any) => (
                      <li key={step.id} className='mb-2'>
                        <span className='font-semibold'>{step.title}</span>
                        {step.instructions ? <div>{step.instructions}</div> : null}
                        {step.warning_text ? <div className='font-semibold text-red-700'>⚠ {step.warning_text}</div> : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}

              <details className='mt-4 text-sm'>
                <summary className='cursor-pointer font-semibold'>Shutdown and restore sequence</summary>
                <h4 className='mt-2 font-semibold text-red-700'>Lockout (shutdown)</h4>
                <ol className='ml-5 list-decimal'>
                  {content.shutdownSequence.map((item, index) => <li key={index}>{item.description}</li>)}
                </ol>
                <h4 className='mt-2 font-semibold text-green-700'>Restore to service</h4>
                <ol className='ml-5 list-decimal'>
                  {content.restoreSequence.map((item, index) => <li key={index}>{item.description}</li>)}
                </ol>
              </details>
            </article>
          )
        })}
      </div>
    </main>
  )
}

export default PublicLotoPage
