import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'

import ScanIssueList from '@/components/scan/ScanIssueList'
import type { ScanIssueRow } from '@/components/scan/ScanIssueList'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { storage } from '@/lib/platform/storage'

export const metadata: Metadata = { title: 'Scan Issue Reports' }
export const dynamic = 'force-dynamic'

const LIMIT = 200
const PHOTO_URL_SECONDS = 15 * 60

/**
 * Port slice 10: issues reported from QR scans (qr_management.view_issues). Location / division scoped users
 * see reports at their locations; own / assigned scope sees only their own reports.
 */
const ScanIssuesPage = async () => {
  const context = await requireTenantPermission('qr_management.view_issues')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const scope = context.permission.scope || 'own'
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_qr_issue_reports')
    .select(
      'id, created_at, qr_code_id, target_type, target_id, asset_id, location_id, title, priority, category, immediate_hazard, marked_out_of_service, anonymous, reporter_name, photos, corrective_action_id, forge_qr_codes(qr_number, name), locations(name), forge_areas(name)'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  if (scope === 'location' || scope === 'division') {
    const assignments = await getTenantScopeAssignments({ organizationId, userId })
    let locationIds: string[] = assignments.locationIds

    if (scope === 'division') {
      const { data: locations } = assignments.divisionIds.length
        ? await supabase.from('locations').select('id').eq('organization_id', organizationId).in('division_id', assignments.divisionIds)
        : { data: [] }

      locationIds = (locations || []).map((row: any) => row.id)
    }

    query = locationIds.length ? query.or(`location_id.in.(${locationIds.join(',')}),reporter_user_id.eq.${userId}`) : query.eq('reporter_user_id', userId)
  } else if (scope !== 'organization') {
    query = query.eq('reporter_user_id', userId)
  }

  const { data: reports, error } = await query

  if (error) throw new Error('Unable to load scan issue reports: ' + error.message)

  const rows = (reports || []) as any[]
  const assetIds = [...new Set(rows.map(row => row.asset_id).filter(Boolean))]
  const capaIds = [...new Set(rows.map(row => row.corrective_action_id).filter(Boolean))]
  const formIds = [...new Set(rows.filter(row => row.target_type === 'form').map(row => row.target_id))]

  const [{ data: assets }, { data: capas }, { data: forms }] = await Promise.all([
    assetIds.length ? supabase.from('forge_assets').select('id, name, asset_number').eq('organization_id', organizationId).in('id', assetIds) : { data: [] },
    capaIds.length ? supabase.from('forge_corrective_actions').select('id, action_number, status').eq('organization_id', organizationId).in('id', capaIds) : { data: [] },
    formIds.length ? supabase.from('forge_form_templates').select('id, title').eq('organization_id', organizationId).in('id', formIds) : { data: [] }
  ])

  const assetById = new Map<string, any>((assets || []).map((row: any) => [row.id, row]))
  const capaById = new Map<string, any>((capas || []).map((row: any) => [row.id, row]))
  const formById = new Map<string, any>((forms || []).map((row: any) => [row.id, row]))
  const canOpenCapa = context.access.effective.some(item => item.permissionKey === 'corrective_actions.view' && item.allowed)

  const items: ScanIssueRow[] = await Promise.all(
    rows.map(async row => {
      const asset = row.asset_id ? assetById.get(row.asset_id) : null
      const capa = row.corrective_action_id ? capaById.get(row.corrective_action_id) : null

      const target =
        row.target_type === 'asset'
          ? asset
            ? [asset.asset_number, asset.name].filter(Boolean).join(' · ')
            : 'Asset (removed)'
          : row.target_type === 'location'
            ? row.locations?.name || 'Location'
            : row.target_type === 'area'
              ? [row.forge_areas?.name || 'Area', row.locations?.name].filter(Boolean).join(' · ')
              : formById.get(row.target_id)?.title || 'Form'

      const photos = await Promise.all(
        (Array.isArray(row.photos) ? row.photos : []).slice(0, 3).map(async (photo: any) => {
          const signed = photo?.path ? await storage().createSignedUrl('forge-evidence', String(photo.path), PHOTO_URL_SECONDS) : { url: null }

          return { name: String(photo?.name || 'Photo'), url: signed.url }
        })
      )

      return {
        id: row.id,
        createdAt: row.created_at,
        qrNumber: row.forge_qr_codes?.qr_number || '',
        qrId: row.qr_code_id,
        qrName: row.forge_qr_codes?.name || '',
        targetType: row.target_type,
        target,
        assetId: row.asset_id,
        location: row.locations?.name || null,
        title: row.title,
        priority: row.priority,
        category: row.category,
        immediateHazard: Boolean(row.immediate_hazard),
        outOfService: Boolean(row.marked_out_of_service),
        reporter: row.reporter_name || (row.anonymous ? 'Anonymous' : 'Unknown'),
        anonymous: Boolean(row.anonymous),
        capaId: capa?.id || null,
        capaNumber: capa?.action_number || null,
        capaStatus: capa?.status || null,
        photos
      }
    })
  )

  return <ScanIssueList items={items} canOpenCapa={canOpenCapa} limit={LIMIT} />
}

export default ScanIssuesPage
