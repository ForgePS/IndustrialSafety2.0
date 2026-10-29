import Link from 'next/link'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { createServiceRoleClient } from '@repo/supabase/server'
import { CloneCoreMatrixButton } from './CloneMatrixButton'
import { getActiveRiskMatrix } from '@/lib/forgeRiskMatrix'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Risk Matrices' }

const RiskMatricesPage = async () => {
  const context = await requireTenantPermission('risk_register.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const canAssess = context.access.effective.some(
    item => item.permissionKey === 'risk_register.assess' && item.allowed
  )

  const [activeMatrix, { data: matrices }] = await Promise.all([
    getActiveRiskMatrix({ organizationId }),
    supabase
      .from('forge_risk_matrices')
      .select('id, organization_id, matrix_key, name, description, version, is_core, is_default, is_active, created_at')
      .or('organization_id.eq.' + organizationId + ',organization_id.is.null')
      .eq('is_active', true)
      .order('organization_id', { ascending: false, nullsFirst: false })
      .order('is_default', { ascending: false })
      .order('version', { ascending: false })
  ])

  const hasTenantDefault = Boolean(
    (matrices || []).some(
      (item: any) => item.organization_id === organizationId && item.is_default && item.is_active
    )
  )

  const bandById = new Map((activeMatrix?.bands || []).map(band => [band.id, band]))
  const likelihoodById = new Map(
    (activeMatrix?.likelihoodLevels || []).map(level => [level.id, level])
  )
  const severityById = new Map(
    (activeMatrix?.severityLevels || []).map(level => [level.id, level])
  )

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
            {context.activeOrganization.name} / Risk Register
          </p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Risk Matrices</h1>
          <p className='text-textSecondary mt-2'>
            Active and core matrices available for inherent and residual risk assessment.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canAssess ? <CloneCoreMatrixButton hasTenantDefault={hasTenantDefault} /> : null}
          <Button variant='outline' asChild>
            <Link href='/risk-register'>Back to Risk Register</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrices</CardTitle>
          <CardDescription>Core platform matrices and tenant-owned active versions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(matrices || []).length ? (
                (matrices || []).map((matrix: any) => (
                  <TableRow key={matrix.id}>
                    <TableCell className='font-medium'>{matrix.name}</TableCell>
                    <TableCell>{matrix.matrix_key}</TableCell>
                    <TableCell>v{matrix.version}</TableCell>
                    <TableCell>
                      {matrix.organization_id ? 'Tenant' : 'Core'}
                    </TableCell>
                    <TableCell className='space-x-2'>
                      {matrix.is_default ? <Badge size='sm'>Default</Badge> : null}
                      {matrix.is_core ? <Badge size='sm' variant='secondary'>Core</Badge> : null}
                      {activeMatrix?.id === matrix.id ? (
                        <Badge size='sm' variant='tonalSuccess'>
                          Active
                        </Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className='py-8 text-center'>
                    No active matrices found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Matrix Summary</CardTitle>
          <CardDescription>
            {activeMatrix
              ? activeMatrix.name +
                ' · ' +
                activeMatrix.matrixKey +
                ' · v' +
                activeMatrix.version +
                (activeMatrix.organizationId ? ' (tenant)' : ' (core fallback)')
              : 'No active matrix configured.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeMatrix ? (
            <div className='overflow-x-auto'>
              <table className='w-full min-w-[640px] border-collapse text-sm'>
                <thead>
                  <tr>
                    <th className='border p-2 text-left'>Likelihood \\ Severity</th>
                    {activeMatrix.severityLevels.map(severity => (
                      <th key={severity.id} className='border p-2 text-center'>
                        {severity.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeMatrix.likelihoodLevels.map(likelihood => (
                    <tr key={likelihood.id}>
                      <th className='border p-2 text-left'>{likelihood.label}</th>
                      {activeMatrix.severityLevels.map(severity => {
                        const cell = activeMatrix.cells.find(
                          item =>
                            item.likelihood_level_id === likelihood.id &&
                            item.severity_level_id === severity.id
                        )
                        const band = cell ? bandById.get(cell.risk_band_id) : null
                        return (
                          <td key={severity.id} className='border p-2 text-center'>
                            {cell ? (
                              <div>
                                <div className='font-semibold'>{cell.score}</div>
                                <div className='text-textSecondary text-xs'>
                                  {band?.label || band?.band_key || '—'}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className='text-textSecondary mt-3 text-xs'>
                Levels: {activeMatrix.likelihoodLevels.length} likelihood ×{' '}
                {activeMatrix.severityLevels.length} severity · {activeMatrix.cells.length} cells ·{' '}
                {activeMatrix.bands.length} bands.
                {likelihoodById.size && severityById.size
                  ? ' Axis labels above map to matrix level keys used during assessment.'
                  : ''}
              </p>
            </div>
          ) : (
            <p className='text-textSecondary text-sm'>
              Clone the core matrix to create a tenant default before assessing risks.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default RiskMatricesPage
