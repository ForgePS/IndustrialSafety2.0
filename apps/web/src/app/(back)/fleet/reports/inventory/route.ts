import { fleetReportResponse } from '@/lib/forgeFleetVehicles'

/** Port slice 11: fleet inventory CSV (fleet.export, scope-filtered). */
export async function GET() {
  return fleetReportResponse(false)
}
