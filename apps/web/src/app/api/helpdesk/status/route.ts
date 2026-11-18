import { NextResponse } from 'next/server'

import { getServiceStatus } from '@/lib/forgeHelpdeskData'

export const dynamic = 'force-dynamic'

// Public service status: platform components and public incidents only (no tenant data).
export async function GET() {
  const status = await getServiceStatus({ includeInternal: false })

  return NextResponse.json(
    {
      overall: status.overall,
      components: status.components.map((c: any) => ({ key: c.component_key, name: c.name, status: c.current_status, updated_at: c.status_updated_at })),
      active_incidents: status.activeIncidents.map((i: any) => ({
        number: i.incident_number,
        title: i.title,
        status: i.status,
        impact: i.impact,
        message: i.public_message,
        started_at: i.started_at,
        updates: (i.updates || []).map((u: any) => ({ status: u.status, message: u.message, at: u.created_at }))
      })),
      scheduled_maintenance: status.maintenance.map((m: any) => ({ title: m.title, body: m.body, starts_at: m.starts_at, ends_at: m.ends_at }))
    },
    { headers: { 'Cache-Control': 'public, max-age=30' } }
  )
}
