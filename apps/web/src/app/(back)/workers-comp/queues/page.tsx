import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'

import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedWcCases, wcRecordWithinScope, wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_STAGE_LABELS, WC_WORK_STATUS_LABELS, daysBetweenIso } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

export const metadata: Metadata = { title: 'Workers\' Comp Queues' }

const VIEWS = [
  { key: 'employees', label: 'Employees' },
  { key: 'return-to-work', label: 'Return to Work' },
  { key: 'medical', label: 'Medical Follow-up' },
  { key: 'osha', label: 'OSHA Recordable' }
] as const

type ViewKey = (typeof VIEWS)[number]['key']

const WcQueuesPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('workers_comp.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const params = await searchParams
  const requested = typeof params.view === 'string' ? params.view : 'employees'

  const medicalPermission = context.access.effective.find(item => item.permissionKey === 'workers_comp.medical.view' && item.allowed)
  const views = VIEWS.filter(view => view.key !== 'medical' || medicalPermission)
  const view: ViewKey = views.some(item => item.key === requested) ? (requested as ViewKey) : 'employees'

  const today = wcTodayIso()
  const cases = await getScopedWcCases({ organizationId, userId, permission: context.permission })
  const active = cases.filter((row: any) => row.status === 'active')
  const supabase = createServiceRoleClient() as any

  let body: React.ReactNode = null

  if (view === 'employees') {
    const people = new Map<string, { name: string; personnelId: string | null; open: number; total: number; daysAway: number; restrictedDays: number }>()

    for (const row of cases) {
      const key = row.personnel_id || `name:${row.employee_name.trim().toLowerCase()}`
      const entry = people.get(key) || { name: row.employee_name, personnelId: row.personnel_id, open: 0, total: 0, daysAway: 0, restrictedDays: 0 }

      entry.total += 1
      if (row.status === 'active') entry.open += 1
      entry.daysAway += row.daysAway
      entry.restrictedDays += row.restrictedDays
      people.set(key, entry)
    }

    const rows = [...people.values()].sort((a, b) => b.open - a.open || b.total - a.total || a.name.localeCompare(b.name))

    body = (
      <Table data-testid='wc-queue-employees'>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Open Cases</TableHead>
            <TableHead>All Cases</TableHead>
            <TableHead>Days Away / Restricted (all cases)</TableHead>
            <TableHead className='text-right'>Personnel</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map(row => (
            <TableRow key={row.personnelId || row.name}>
              <TableCell className='font-semibold'>{row.name}</TableCell>
              <TableCell>{row.open}</TableCell>
              <TableCell>{row.total}</TableCell>
              <TableCell>{row.daysAway} / {row.restrictedDays}</TableCell>
              <TableCell className='text-right'>
                {row.personnelId ? <Button size='sm' variant='outline' asChild><Link href={`/personnel/${row.personnelId}`}>Personnel File</Link></Button> : '—'}
              </TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={5} className='py-8 text-center'>No employees have workers&apos; comp cases.</TableCell></TableRow>}
        </TableBody>
      </Table>
    )
  }

  if (view === 'return-to-work') {
    const queue = active.filter(
      (row: any) => row.current_work_status === 'restricted' || row.current_work_status === 'off_work' || row.stage === 'treatment' || row.stage === 'return_to_work'
    )

    const { data: activeRestrictions } = queue.length
      ? await supabase.from('forge_wc_restrictions').select('case_id').eq('organization_id', organizationId).eq('status', 'active').in('case_id', queue.map((row: any) => row.id))
      : { data: [] }

    const restrictionCount = new Map<string, number>()

    for (const item of activeRestrictions || []) restrictionCount.set(item.case_id, (restrictionCount.get(item.case_id) || 0) + 1)

    body = (
      <Table data-testid='wc-queue-rtw'>
        <TableHeader>
          <TableRow>
            <TableHead>Case</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Work Status</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Days Away / Restricted</TableHead>
            <TableHead>Active Restrictions</TableHead>
            <TableHead className='text-right'>Record</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue.length ? queue.map((row: any) => (
            <TableRow key={row.id}>
              <TableCell className='font-semibold'>{row.case_number}</TableCell>
              <TableCell>{row.employee_name}</TableCell>
              <TableCell>{row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : '—'}</TableCell>
              <TableCell>{WC_STAGE_LABELS[row.stage as WcStage]}</TableCell>
              <TableCell>{row.daysAway} / {row.restrictedDays}</TableCell>
              <TableCell>{restrictionCount.get(row.id) || 0}</TableCell>
              <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={`/workers-comp/${row.id}`}>Open</Link></Button></TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={7} className='py-8 text-center'>No one is in the return-to-work queue.</TableCell></TableRow>}
        </TableBody>
      </Table>
    )
  }

  if (view === 'medical' && medicalPermission) {
    // Medical access can have its own scope; only list cases it reaches.
    const reachable = (
      await Promise.all(active.map(async (row: any) => ({ row, ok: await wcRecordWithinScope({ organizationId, userId, scope: medicalPermission.scope, record: row }) })))
    ).filter(item => item.ok).map(item => item.row)

    const { data: visits } = reachable.length
      ? await supabase
          .from('forge_wc_medical_encounters')
          .select('case_id, encounter_date, next_appointment_date')
          .eq('organization_id', organizationId)
          .in('case_id', reachable.map((row: any) => row.id))
      : { data: [] }

    const latest = new Map<string, { last: string | null; next: string | null }>()

    for (const visit of visits || []) {
      const entry = latest.get(visit.case_id) || { last: null, next: null }

      if (!entry.last || visit.encounter_date > entry.last) entry.last = visit.encounter_date
      if (visit.next_appointment_date && visit.next_appointment_date >= today && (!entry.next || visit.next_appointment_date < entry.next)) entry.next = visit.next_appointment_date
      latest.set(visit.case_id, entry)
    }

    const rows = reachable
      .map((row: any) => {
        const entry = latest.get(row.id) || { last: null, next: null }
        const sinceLast = entry.last ? daysBetweenIso(entry.last, today) : null

        return { row, ...entry, needsFollowUp: !entry.next && (sinceLast === null || sinceLast > 14) }
      })
      .sort((a, b) => Number(b.needsFollowUp) - Number(a.needsFollowUp))

    body = (
      <Table data-testid='wc-queue-medical'>
        <TableHeader>
          <TableRow>
            <TableHead>Case</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Last Visit</TableHead>
            <TableHead>Next Appointment</TableHead>
            <TableHead>Follow-up</TableHead>
            <TableHead className='text-right'>Record</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map(item => (
            <TableRow key={item.row.id}>
              <TableCell className='font-semibold'>{item.row.case_number}</TableCell>
              <TableCell>{item.row.employee_name}</TableCell>
              <TableCell>{item.last || 'None recorded'}</TableCell>
              <TableCell>{item.next || '—'}</TableCell>
              <TableCell>{item.needsFollowUp ? <Badge size='sm' variant='destructive'>Needs follow-up</Badge> : <Badge size='sm' variant='secondary'>Scheduled / recent</Badge>}</TableCell>
              <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={`/workers-comp/${item.row.id}`}>Open</Link></Button></TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={6} className='py-8 text-center'>No active cases.</TableCell></TableRow>}
        </TableBody>
      </Table>
    )
  }

  if (view === 'osha') {
    const recordable = cases.filter((row: any) => row.osha_recordable)

    const { data: oshaCases } = recordable.length
      ? await supabase.from('forge_osha_cases').select('id, case_number, days_away, restricted_days').in('id', recordable.map((row: any) => row.osha_case_id).filter(Boolean))
      : { data: [] }

    const byId = new Map<string, any>((oshaCases || []).map((item: any) => [item.id, item]))

    body = (
      <Table data-testid='wc-queue-osha'>
        <TableHeader>
          <TableRow>
            <TableHead>Case</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>OSHA Case</TableHead>
            <TableHead>On the Log (away / restricted)</TableHead>
            <TableHead>Current (away / restricted)</TableHead>
            <TableHead className='text-right'>Record</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recordable.length ? recordable.map((row: any) => {
            const osha = row.osha_case_id ? byId.get(row.osha_case_id) : null

            return (
              <TableRow key={row.id}>
                <TableCell className='font-semibold'>{row.case_number}</TableCell>
                <TableCell>
                  {row.employee_name}
                  {row.osha_privacy_case ? <Badge size='sm' variant='secondary' className='ms-2'>Privacy case</Badge> : null}
                </TableCell>
                <TableCell>{osha ? <Link className='text-primary hover:underline' href={`/osha/cases/${osha.id}`}>{osha.case_number}</Link> : 'Not linked yet'}</TableCell>
                <TableCell>{osha ? `${osha.days_away} / ${osha.restricted_days}` : '—'}</TableCell>
                <TableCell>{row.daysAway} / {row.restrictedDays}</TableCell>
                <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={`/workers-comp/${row.id}`}>Open</Link></Button></TableCell>
              </TableRow>
            )
          }) : <TableRow><TableCell colSpan={6} className='py-8 text-center'>No cases are marked OSHA recordable.</TableCell></TableRow>}
        </TableBody>
      </Table>
    )
  }

  const description: Record<ViewKey, string> = {
    employees: 'Everyone with a workers\' comp case, most open cases first.',
    'return-to-work': 'Active cases off work, on restricted duty, or in treatment or return-to-work stages.',
    medical: 'Active cases by last medical visit. Flags cases with no upcoming appointment and no visit in 14 days.',
    osha: 'Claims marked OSHA recordable. Day counts on the log refresh overnight and whenever the case changes.'
  }

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Queues</h1>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Back</Link></Button>
      </div>

      <nav className='flex flex-wrap gap-2' aria-label='Queues'>
        {views.map(item => (
          <Button key={item.key} size='sm' variant={item.key === view ? 'default' : 'outline'} asChild>
            <Link href={`/workers-comp/queues?view=${item.key}`} aria-current={item.key === view ? 'page' : undefined}>{item.label}</Link>
          </Button>
        ))}
      </nav>

      <Card className='min-w-0 [contain:inline-size]'>
        <CardHeader>
          <CardTitle>{views.find(item => item.key === view)?.label}</CardTitle>
          <CardDescription>{description[view]}</CardDescription>
        </CardHeader>
        {body}
      </Card>
    </div>
  )
}

export default WcQueuesPage
