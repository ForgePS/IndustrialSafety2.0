import { fleetReportResponse } from '@/lib/forgeFleetVehicles'

/** Port slice 11: removed / sold / disposed vehicles CSV (fleet.export, scope-filtered). */
export async function GET() {
  return fleetReportResponse(true)
}
