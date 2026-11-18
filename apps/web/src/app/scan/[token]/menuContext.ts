import { createServiceRoleClient } from '@repo/supabase/server'

import type { ScanQr, ScanTarget } from '@/lib/forgeScanContext'
import { loadScanQr, loadScanTarget, resolveScanViewer, scanMenuTargetInput } from '@/lib/forgeScanContext'
import type { ScanAction, ScanActionId, ScanViewer } from '@/lib/forgeScanRules'
import { buildScanActions } from '@/lib/forgeScanRules'

/**
 * Port slice 10: everything the scan menu (/scan/<token>) and its server actions need, loaded fresh
 * from the token. Nothing here comes from the browser except the token itself.
 */
export type ScanMenuContext = {
  qr: ScanQr
  target: ScanTarget
  viewer: ScanViewer
  actions: ScanAction[]
}

const db = () => createServiceRoleClient() as any

/** Published forms offered on this QR: config.formTemplateIds plus the target form of a form QR. */
const loadForms = async (qr: ScanQr) => {
  const ids = [...new Set([...(qr.targetType === 'form' ? [qr.targetId] : []), ...qr.config.formTemplateIds])]

  if (!ids.length) return []

  const { data } = await db()
    .from('forge_form_templates')
    .select('id, title')
    .eq('organization_id', qr.organizationId)
    .eq('status', 'active')
    .is('archived_at', null)
    .in('id', ids)

  const byId = new Map<string, string>((data || []).map((row: any) => [row.id, row.title]))

  return ids.filter(id => byId.has(id)).map(id => ({ id, title: byId.get(id) as string }))
}

const hasApprovedLoto = async (qr: ScanQr, target: ScanTarget) => {
  if (target.type !== 'asset' || !qr.config.lotoView) return false

  const { count } = await db()
    .from('forge_loto_procedures')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', qr.organizationId)
    .eq('asset_id', target.id)
    .eq('status', 'approved')

  return (count || 0) > 0
}

export const loadScanMenuContext = async (token: string): Promise<ScanMenuContext | null> => {
  const qr = await loadScanQr(token)

  if (!qr) return null

  const target = await loadScanTarget(qr)

  if (!target) return null

  const [viewer, lotoAvailable, forms] = await Promise.all([resolveScanViewer(qr), hasApprovedLoto(qr, target), loadForms(qr)])

  const actions = buildScanActions({
    targetType: qr.targetType,
    targetId: qr.targetId,
    token: qr.token,
    accessMode: qr.accessMode,
    config: qr.config,
    ...scanMenuTargetInput(target),
    lotoAvailable,
    forms
  })

  return { qr, target, viewer, actions }
}

export const findScanAction = (context: ScanMenuContext, id: ScanActionId) => context.actions.find(action => action.id === id) || null

/** ?next= values the identify form forwards to after success. */
export const SCAN_NEXT_PATHS: Record<string, string> = {
  report: 'report',
  'inspect-daily': 'inspect/daily',
  'inspect-weekly': 'inspect/weekly',
  'inspect-monthly': 'inspect/monthly',
  history: 'history',
  'dvir-pre_trip': 'dvir/pre_trip',
  'dvir-post_trip': 'dvir/post_trip'
}

export const scanNextPath = (token: string, next: string | null | undefined) => {
  const sub = next ? SCAN_NEXT_PATHS[next] : undefined

  return sub ? `/scan/${token}/${sub}` : `/scan/${token}`
}
