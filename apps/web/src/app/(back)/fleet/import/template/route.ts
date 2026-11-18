import { NextResponse } from 'next/server'

import { csvResponse } from '@/lib/forgeCsv'
import { FLEET_TEMPLATE_HEADERS } from '@/lib/forgeFleetImportRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/** Port slice 11: the vehicle import template (1.0 industrial.fleet.v1 columns plus Unit Number). */
export async function GET() {
  if (!(await tenantPermissionOrNull('fleet.create'))) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  return csvResponse('fleet-vehicle-import-template.csv', FLEET_TEMPLATE_HEADERS, [])
}
