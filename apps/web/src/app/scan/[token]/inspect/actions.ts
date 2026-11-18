'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/forgeTenantContext'
import { loadScanQr, loadScanTarget, resolveScanViewer } from '@/lib/forgeScanContext'
import type { CompleteScanInspectionResult } from '@/lib/forgeScanInspections'
import { completeEmployeeScanInspection, isScanFrequency, saveEmployeeScanAnswer, startScanInspection } from '@/lib/forgeScanInspections'
import type { ScanAnswer } from '@/lib/forgeScanInspectionRules'

/**
 * Port slice 10: the scan inspection runner's server actions. Only the token and the inspection / item ids
 * come from the browser; the QR, its target, the viewer and the inspection's ownership are loaded and checked
 * again on every call (forgeScanInspections).
 */

const context = async (token: string) => {
  const qr = await loadScanQr(String(token || ''))

  if (!qr) return null

  const target = await loadScanTarget(qr)

  if (!target) return null

  return { qr, target, viewer: await resolveScanViewer(qr) }
}

/**
 * The Start button. Starting is a POST (never a page load), so link prefetching or a reload cannot create
 * inspections. Signed-in members continue on the normal inspection page, switched to the QR's company;
 * employees come back to the runner.
 */
export const beginScanInspection = async (token: string, frequency: string): Promise<void> => {
  const loaded = await context(token)

  if (!loaded || !isScanFrequency(frequency)) redirect('/q/unavailable')

  const page = `/scan/${loaded.qr.token}/inspect/${frequency}`
  const started = await startScanInspection({ qr: loaded.qr, target: loaded.target, viewer: loaded.viewer, frequency })

  if ('error' in started) redirect(`${page}?error=${encodeURIComponent(started.error)}`)

  if (loaded.viewer.kind === 'user') {
    ;(await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, loaded.qr.organizationId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365
    })
    redirect(`/inspections/${started.inspectionId}`)
  }

  redirect(page)
}

export const saveScanInspectionAnswer = async (
  token: string,
  input: { inspectionId: string; itemId: string; value: string | null; notes: string | null }
): Promise<{ ok: true } | { error: string }> => {
  const loaded = await context(token)

  if (!loaded) return { error: 'This QR code is no longer active.' }
  if (loaded.viewer.kind !== 'employee') return { error: 'Enter your employee number on the scan page first.' }

  return saveEmployeeScanAnswer({
    qr: loaded.qr,
    viewer: loaded.viewer,
    inspectionId: String(input?.inspectionId || ''),
    itemId: String(input?.itemId || ''),
    value: input?.value ?? null,
    notes: input?.notes ?? null
  })
}

export const completeScanInspection = async (
  token: string,
  input: { inspectionId: string; answers: Record<string, ScanAnswer> }
): Promise<CompleteScanInspectionResult> => {
  const loaded = await context(token)

  if (!loaded) return { error: 'This QR code is no longer active.' }
  if (loaded.viewer.kind !== 'employee') return { error: 'Enter your employee number on the scan page first.' }

  return completeEmployeeScanInspection({
    qr: loaded.qr,
    target: loaded.target,
    viewer: loaded.viewer,
    inspectionId: String(input?.inspectionId || ''),
    answers: input?.answers && typeof input.answers === 'object' ? input.answers : {}
  })
}
