import { createServiceRoleClient } from '@repo/supabase/server'

import { loadScanQr, loadScanTarget, resolveScanViewer, scanMenuTargetInput } from '@/lib/forgeScanContext'
import type { ScanQr, ScanTarget } from '@/lib/forgeScanContext'
import { buildScanActions, canUseScanAction } from '@/lib/forgeScanRules'
import type { ScanViewer } from '@/lib/forgeScanRules'
import { ISSUE_UPLOADS_PER_WINDOW, ISSUE_UPLOAD_WINDOW_MINUTES } from '@/lib/forgeScanIssues'

/**
 * Port slice 10: the shared server check for the issue report page, its action and its photo route.
 * Everything comes from the token: the QR, its target, the viewer, and whether the QR's actions allow
 * report_issue (and out_of_service) for that viewer.
 */

export type ReportContext = {
  qr: ScanQr
  target: ScanTarget
  viewer: ScanViewer

  /** The QR's action config offers report_issue at all. */
  reportOffered: boolean
  canReport: boolean
  canMarkOutOfService: boolean
}

export const db = () => createServiceRoleClient() as any

export const loadReportContext = async (token: string): Promise<ReportContext | null> => {
  const qr = await loadScanQr(token)

  if (!qr) return null

  const target = await loadScanTarget(qr)

  if (!target) return null

  const viewer = await resolveScanViewer(qr)

  const actions = buildScanActions({
    targetType: qr.targetType,
    targetId: qr.targetId,
    token: qr.token,
    accessMode: qr.accessMode,
    config: qr.config,
    ...scanMenuTargetInput(target)
  })

  const report = actions.find(action => action.id === 'report_issue')
  const outOfService = actions.find(action => action.id === 'out_of_service')

  return {
    qr,
    target,
    viewer,
    reportOffered: Boolean(report),
    canReport: Boolean(report && canUseScanAction(report, viewer, qr.accessMode, qr.config)),
    canMarkOutOfService: Boolean((target.type === 'asset' || target.type === 'vehicle') && outOfService && canUseScanAction(outOfService, viewer, qr.accessMode, qr.config))
  }
}

/** Who uploaded / reported, for binding photo uploads to the same reporter. */
export const uploaderIds = (viewer: ScanViewer) => ({
  userId: viewer.kind === 'user' ? viewer.userId : null,
  personnelId: viewer.kind === 'anonymous' ? null : viewer.personnelId
})

/** Uploads on this QR in the current window (public QRs can be scanned by anyone). */
export const recentUploadCount = async (qrId: string) => {
  const since = new Date(Date.now() - ISSUE_UPLOAD_WINDOW_MINUTES * 60_000).toISOString()

  const { count } = await db().from('forge_qr_issue_uploads').select('id', { count: 'exact', head: true }).eq('qr_code_id', qrId).gte('created_at', since)

  return count || 0
}

export const uploadLimitReached = async (qrId: string) => (await recentUploadCount(qrId)) >= ISSUE_UPLOADS_PER_WINDOW
