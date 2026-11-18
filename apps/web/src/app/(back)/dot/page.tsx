import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill, { issueTone } from '@/components/dot/DotStatusPill'
import { DOT_RECORD_CATEGORY_LABELS, getScopedCompanyDrivers, getScopedDotRecords, getScopedDriverFiles } from '@/lib/forgeDot'
import { DOT_ISSUE_LABELS, buildDotAttentionCards, summarizeDotRecords, type DotIssueKind } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DOT Compliance' }

const DotDashboardPage = async () => {
  const context = await requireTenantPermission('dot.view')
  const organizationId = context.activeOrganization.id
  const allowed = allowedFrom(context)

  const [files, drivers, records] = await Promise.all([
    getScopedDriverFiles({ organizationId, userId: context.user.id, permission: context.permission }),
    getScopedCompanyDrivers({ organizationId, userId: context.user.id, permission: context.permission }),
    getScopedDotRecords({ organizationId, userId: context.user.id, permission: context.permission })
  ])

  const attentionCards = buildDotAttentionCards(files, drivers)
  const recordSummary = summarizeDotRecords(records, Object.keys(DOT_RECORD_CATEGORY_LABELS))

  const compliant = files.filter(file => !file.issues.some(issue => issue.kind !== 'expiring')).length
  const score = files.length ? Math.round((compliant / files.length) * 100) : null

  const countKind = (kind: DotIssueKind, list: Array<{ issues: Array<{ kind: string }> }>) =>
    list.filter(item => item.issues.some(issue => issue.kind === kind)).length

  const tiles = [
    {
      label: 'Compliant files',
      value: score === null ? '—' : `${score}%`,
      detail: score === null ? 'No open driver files yet' : `${compliant} of ${files.length} driver files`,
      tone: score === null ? 'text-textSecondary' : score >= 90 ? 'text-success' : score >= 70 ? 'text-warning' : 'text-destructive'
    },
    { label: DOT_ISSUE_LABELS.expired, value: countKind('expired', files), detail: 'drivers with an expired credential', tone: 'text-destructive' },
    { label: DOT_ISSUE_LABELS.expiring, value: countKind('expiring', files), detail: 'drivers', tone: 'text-pink-600' },
    { label: DOT_ISSUE_LABELS.missingDocuments, value: countKind('missingDocuments', files), detail: 'drivers', tone: 'text-destructive' },
    { label: 'Company drivers', value: drivers.filter(item => item.driver.status !== 'removed').length, detail: `${countKind('pendingMvr', drivers)} pending MVR · ${countKind('missingMvrConsent', drivers)} need consent`, tone: 'text-textPrimary' }
  ]

  const attention = [
    ...files.flatMap(file =>
      file.issues.filter(issue => issue.kind !== 'missingDocuments').map(issue => ({ key: file.id + issue.kind + issue.slot, name: file.name, href: '/dot/drivers/' + file.id, source: 'DQF', issue }))
    ),
    ...files
      .filter(file => file.issues.some(issue => issue.kind === 'missingDocuments'))
      .map(file => {
        const missing = file.issues.filter(issue => issue.kind === 'missingDocuments')

        return {
          key: file.id + 'missing',
          name: file.name,
          href: '/dot/drivers/' + file.id,
          source: 'DQF',
          issue: { kind: 'missingDocuments' as const, label: `${missing.length} document${missing.length === 1 ? '' : 's'}`, detail: missing.map(item => item.label).slice(0, 3).join(', ') + (missing.length > 3 ? '…' : '') }
        }
      }),
    ...drivers.flatMap(driver =>
      driver.issues.map(issue => ({ key: driver.id + issue.kind, name: driver.name, href: '/dot/company-drivers/' + driver.id, source: 'Company driver', issue }))
    )
  ]

  const order: DotIssueKind[] = ['expired', 'pendingMvr', 'missingMvrConsent', 'sampleDue', 'expiring', 'missingLicenseExpiry', 'missingLicenseCopy', 'missingDocuments']

  attention.sort((a, b) => order.indexOf(a.issue.kind) - order.indexOf(b.issue.kind) || a.name.localeCompare(b.name))

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader active='dashboard' allowed={allowed} />

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
        {tiles.map(tile => (
          <Card key={tile.label}>
            <CardHeader className='pb-2'>
              <CardDescription>{tile.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={'text-3xl font-bold ' + tile.tone}>{tile.value}</div>
              <div className='text-textSecondary text-xs'>{tile.detail}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Follow-ups by type</CardTitle>
          <CardDescription>Each card opens the list filtered to the drivers it counts.</CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {attentionCards.map(card => (
            <Link
              key={card.kind}
              href={card.href}
              className='hover:bg-secondary/50 flex items-center justify-between gap-2 rounded-lg border p-3'
              data-attention-card={card.kind}
            >
              <span>
                <span className='block text-sm font-medium'>{card.label}</span>
                <span className='text-textSecondary text-xs'>{card.source === 'dqf' ? 'Driver files' : 'Company drivers'}</span>
              </span>
              <span className={'text-2xl font-bold ' + (card.count ? (card.kind === 'expiring' || card.kind === 'sampleDue' ? 'text-pink-600' : 'text-destructive') : 'text-textSecondary')}>
                {card.count}
              </span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>DOT records</CardTitle>
          <CardDescription>
            {recordSummary.total} record{recordSummary.total === 1 ? '' : 's'} · {recordSummary.open} open
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-3 xl:grid-cols-6'>
          <Link href='/dot/records?status=open' className='hover:bg-secondary/50 rounded-lg border p-3' data-dot-record-tile='open'>
            <span className='text-textSecondary block text-xs'>Open</span>
            <span className='text-2xl font-bold'>{recordSummary.open}</span>
          </Link>
          {Object.entries(DOT_RECORD_CATEGORY_LABELS).map(([key, label]) => (
            <Link key={key} href={'/dot/records?category=' + key} className='hover:bg-secondary/50 rounded-lg border p-3' data-dot-record-tile={key}>
              <span className='text-textSecondary block text-xs'>{label}</span>
              <span className='text-2xl font-bold'>{recordSummary.byCategory[key] || 0}</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>Active drivers only. Expiring means within 30 days.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col divide-y'>
          {attention.length ? (
            attention.slice(0, 200).map(item => (
              <Link key={item.key} href={item.href} className='hover:bg-secondary/50 flex flex-wrap items-center justify-between gap-2 py-2' data-attention={item.issue.kind}>
                <span>
                  <span className='font-semibold'>{item.name}</span>
                  <span className='text-textSecondary ml-2 text-xs'>{item.source}</span>
                </span>
                <span className='flex items-center gap-2 text-sm'>
                  <span className='text-textSecondary'>
                    {item.issue.label}: {item.issue.detail}
                  </span>
                  <DotStatusPill tone={issueTone(item.issue.kind)}>{DOT_ISSUE_LABELS[item.issue.kind]}</DotStatusPill>
                </span>
              </Link>
            ))
          ) : (
            <p className='text-textSecondary py-4 text-sm'>Nothing needs attention.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default DotDashboardPage
