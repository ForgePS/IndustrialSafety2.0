import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { MAX_FLEET_IMPORT_BYTES, runFleetImport } from '@/lib/forgeFleetImport'
import type { FleetContext } from '@/lib/forgeFleetVehicles'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 11: runs the vehicle CSV import (fleet.create). A route handler because server actions accept
 * 1 MB. Body: multipart with `file` (CSV, at most 5 MB) and `dryRun` ('1' or '0').
 */

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

const sameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  if (!origin || !host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return fail('Not allowed.', 403)

  const context = (await tenantPermissionOrNull('fleet.create')) as unknown as FleetContext | null

  if (!context) return fail('Not found.', 404)
  if (Number(request.headers.get('content-length') || 0) > MAX_FLEET_IMPORT_BYTES + 64 * 1024) return fail('The file is larger than 5 MB.', 413)

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const dryRun = String(form?.get('dryRun') ?? '1') !== '0'

  if (!file || typeof file === 'string') return fail('Choose a CSV file.', 400)
  if (file.size > MAX_FLEET_IMPORT_BYTES) return fail('The file is larger than 5 MB.', 413)

  try {
    const summary = await runFleetImport({ context, text: await file.text(), dryRun })

    if (!dryRun) {
      revalidatePath('/fleet')
      revalidatePath('/fleet/vehicles')
      revalidatePath('/fleet/renewals')
    }

    return NextResponse.json(summary)
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'The import failed.', 400)
  }
}
