import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import ScanMenu from '@/components/scan/ScanMenu'
import ScanPageShell from '@/components/scan/ScanPageShell'
import AreaBriefing from '@/components/waypoint/AreaBriefing'
import { loadArea, loadAreaBriefing } from '@/lib/forgeWaypoint'
import { optionalUserId } from '@/lib/platform/identity'
import { allowsEmployeeIdentification, scanMenuForViewer } from '@/lib/forgeScanRules'

import { SCAN_NEXT_PATHS, loadScanMenuContext } from './menuContext'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Scan', robots: { index: false, follow: false } }

/**
 * Port slice 10: the public scan menu (Industrial 1.0 scan-public-workspace). The QR token is the
 * authority; who may do what comes from the QR's access mode and action config and the viewer
 * (signed-in member, employee identified by number on this QR, or anonymous). The 'open' scan event
 * is logged once per page load by the menu itself, so server-action re-renders do not count again.
 */
const ScanMenuPage = async ({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ next?: string }> }) => {
  const [{ token }, { next }] = await Promise.all([params, searchParams])
  const context = await loadScanMenuContext(token)

  if (!context) redirect('/q/unavailable')

  const { qr, target, viewer, actions } = context
  const anonymous = viewer.kind === 'anonymous'
  const canIdentify = anonymous && allowsEmployeeIdentification(qr.accessMode)
  const menu = scanMenuForViewer(actions, viewer, qr.accessMode, qr.config)
  const otherCompanyUser = anonymous && Boolean(await optionalUserId())

  // Waypoint Area Card: the "Before you enter" brief comes before the menu. Equipment details need an
  // employee number or a sign-in. The status light, PPE, hazards and emergency info are for anyone at the door,
  // unless the QR is set to signed-in users only.
  const showBriefing = target.type === 'area' && (!anonymous || qr.accessMode !== 'signed_in')
  const area = showBriefing ? await loadArea(qr.organizationId, target.id) : null
  const briefing = area ? await loadAreaBriefing(qr.organizationId, area, { detailed: !anonymous }) : null

  return (
    <ScanPageShell qr={qr} target={target} viewer={viewer}>
      {qr.description ? <p className='text-textSecondary text-sm'>{qr.description}</p> : null}
      {briefing ? <AreaBriefing {...briefing} /> : null}
      <ScanMenu
        token={qr.token}
        actions={menu}
        viewer={{ kind: viewer.kind, name: viewer.kind === 'anonymous' ? null : viewer.name }}
        canIdentify={canIdentify}
        signInRequired={anonymous && !canIdentify}
        otherCompanyUser={otherCompanyUser}
        initialNext={next && SCAN_NEXT_PATHS[next] ? next : null}
      />
    </ScanPageShell>
  )
}

export default ScanMenuPage
