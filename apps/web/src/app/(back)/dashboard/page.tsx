import type { ReactNode } from 'react'

import type { Metadata } from 'next'
import { TbBuilding } from 'react-icons/tb'
import { Card, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { cn } from '@repo/ui/lib/utils'

import BodyMapCard from '@/components/dashboard/BodyMapCard'
import {
  AttentionBlock,
  IncidentTrendBlock,
  InjuryHistoryBlock,
  InspectionsBySiteBlock,
  TaskSchedulerBlock,
  TasksDueBlock,
  WorkspaceBlock
} from '@/components/dashboard/DashboardBlocks'
import DashboardCustomize from '@/components/dashboard/DashboardCustomize'
import SafetyIndexCard from '@/components/dashboard/SafetyIndexCard'
import { parseBodyMapPeriod } from '@/lib/forgeBodyMapRules'
import { getDashboardData, getDashboardLayout } from '@/lib/forgeDashboard'
import { DASHBOARD_SIZE_CLASSES, resolvePinnedModules, type DashboardBlockId } from '@/lib/forgeDashboardRules'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { getEffectiveExperience } from '@/lib/forgeExperience'
import { getTenantContext } from '@/lib/forgeTenantContext'

export const metadata: Metadata = { title: 'Dashboard' }

const DashboardPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const { user, activeOrganization } = await getTenantContext()

  if (!user || !activeOrganization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No company assigned</CardTitle>
          <CardDescription>Your account is not currently assigned to an active Forge tenant.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const organizationId = activeOrganization.id
  const params = await searchParams

  const [experience, access, layout] = await Promise.all([
    getEffectiveExperience({ organizationId, userId: user.id, types: ['menu', 'dashboard', 'widget'] }),
    getEffectiveTenantAccess({ organizationId, userId: user.id }),
    getDashboardLayout({ organizationId, userId: user.id })
  ])

  const modules = experience.filter(item => item.type === 'menu' && item.key !== 'nav.company_settings')
  const dashboardElement = experience.find(item => item.key === 'dashboard.home')
  const data = await getDashboardData({ organizationId, userId: user.id, access, modules })

  // Each block renders only when the viewer can see its data; a block with nothing to show is left out.
  const blocks: Partial<Record<DashboardBlockId, ReactNode>> = {
    attention: <AttentionBlock items={data.attention} quickActions={data.quickActions} />,
    'tasks-due': data.tasksDue ? <TasksDueBlock tasks={data.tasksDue} /> : null,
    'safety-index': data.safetyIndex ? <SafetyIndexCard periods={data.safetyIndex.periods} dotCompliance={data.safetyIndex.dotCompliance} /> : null,
    'task-scheduler': data.taskScheduler ? <TaskSchedulerBlock schedule={data.taskScheduler} /> : null,
    'incident-trend': data.incidentTrend ? <IncidentTrendBlock months={data.incidentTrend} /> : null,
    'injury-history': data.injuryHistory ? <InjuryHistoryBlock rows={data.injuryHistory} hasOsha={data.injuryHistory.some(row => row.recordables !== null)} /> : null,
    'inspections-by-site': data.inspectionsBySite ? <InspectionsBySiteBlock rows={data.inspectionsBySite} /> : null,
    'body-map': data.bodyMap ? <BodyMapCard data={data.bodyMap} initialPeriod={parseBodyMapPeriod(params.bodyMap)} title='Injury Body Map' /> : null,
    workspace: <WorkspaceBlock modules={resolvePinnedModules(modules, layout.pinnedModules)} />
  }

  const available = layout.items.filter(item => blocks[item.id]).map(item => item.id)
  const visible = layout.items.filter(item => item.visible && blocks[item.id])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{activeOrganization.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{dashboardElement?.label || 'Dashboard'}</h1>
          <p className='text-textSecondary mt-2'>{dashboardElement?.description || 'Your Forge Industrial Safety workspace.'}</p>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='text-textSecondary flex items-center gap-2 text-sm'>
            <TbBuilding />
            <span>{activeOrganization.membershipRole}</span>
          </div>
          <DashboardCustomize layout={layout} available={available} modules={modules.map(item => ({ key: item.key, label: item.label }))} />
        </div>
      </div>

      <div className='grid grid-cols-12 gap-5' data-testid='dashboard-grid'>
        {visible.map(item => (
          <section key={item.id} className={cn('min-w-0', DASHBOARD_SIZE_CLASSES[item.size])} data-dashboard-block={item.id} data-dashboard-size={item.size}>
            {blocks[item.id]}
          </section>
        ))}
        {!visible.length ? (
          <Card className='col-span-12'>
            <CardHeader>
              <CardTitle>Every block is hidden</CardTitle>
              <CardDescription>Use Customize to show blocks again, or reset to the default layout.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

export default DashboardPage
