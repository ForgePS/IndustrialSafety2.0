import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { loadVehicleInScope, type FleetContext } from '@/lib/forgeFleetVehicles'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { storage } from '@/lib/platform/storage'

/** Port slice 11: opens a vehicle document through a short-lived signed link (fleet.view, vehicle scope). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params
  const context = (await tenantPermissionOrNull('fleet.view')) as unknown as FleetContext | null

  if (!context || !/^[0-9a-f-]{36}$/i.test(documentId)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const vehicle = await loadVehicleInScope({ context, vehicleId: id })

  if (!vehicle) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { data: document } = await (createServiceRoleClient() as any)
    .from('forge_fleet_documents')
    .select('storage_path, file_name')
    .eq('organization_id', context.activeOrganization.id)
    .eq('vehicle_id', vehicle.id)
    .eq('id', documentId)
    .is('archived_at', null)
    .maybeSingle()

  if (!document) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { url } = await storage().createSignedUrl('forge-fleet', document.storage_path, 300, { downloadAs: document.file_name })

  if (!url) return NextResponse.json({ error: 'Unable to open the file.' }, { status: 500 })

  return NextResponse.redirect(url)
}
