import Link from 'next/link'
import { TbAlertTriangle, TbArrowLeft, TbMessageReport } from 'react-icons/tb'

import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import { issueCategoryLabel } from '@/lib/forgeScanIssues'

export type ScanIssueRow = {
  id: string
  createdAt: string
  qrNumber: string
  qrId: string
  qrName: string
  targetType: string
  target: string
  assetId: string | null
  location: string | null
  title: string
  priority: string
  category: string | null
  immediateHazard: boolean
  outOfService: boolean
  reporter: string
  anonymous: boolean
  capaId: string | null
  capaNumber: string | null
  capaStatus: string | null
  photos: { name: string; url: string | null }[]
}

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-200 text-amber-900',
  low: 'bg-slate-200 text-slate-800'
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'

/** Port slice 10: the scan issue report list at /qr/issues. */
const ScanIssueList = ({ items, canOpenCapa, limit }: { items: ScanIssueRow[]; canOpenCapa: boolean; limit: number }) => (
  <div className='flex flex-col gap-6'>
    <div>
      <Link href='/qr' className='text-textSecondary flex items-center gap-1 text-sm'>
        <TbArrowLeft /> QR Management
      </Link>
      <h1 className='text-textPrimary mt-2 flex items-center gap-3 text-3xl font-bold'>
        <TbMessageReport />
        Scan Issue Reports
      </h1>
      <p className='text-textSecondary mt-2'>Problems reported by scanning a QR code. Each report opens a Corrective Action.</p>
    </div>

    <Card>
      <CardContent className='p-0'>
        {items.length ? (
          <Table data-testid='scan-issue-table'>
            <TableHeader>
              <TableRow>
                <TableHead>Reported</TableHead>
                <TableHead>QR / target</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reported by</TableHead>
                <TableHead>Corrective Action</TableHead>
                <TableHead>Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id} data-testid='scan-issue-row' data-report-id={item.id}>
                  <TableCell className='whitespace-nowrap text-sm'>{formatDate(item.createdAt)}</TableCell>
                  <TableCell>
                    <Link href={`/qr/${item.qrId}`} className='text-primary font-semibold'>
                      {item.qrNumber}
                    </Link>
                    <div className='text-sm'>
                      {item.assetId ? (
                        <Link href={`/assets/${item.assetId}`} className='hover:underline'>
                          {item.target}
                        </Link>
                      ) : (
                        item.target
                      )}
                    </div>
                    {item.location ? <div className='text-textSecondary text-xs'>{item.location}</div> : null}
                  </TableCell>
                  <TableCell className='max-w-xs'>
                    <div className='font-medium'>{item.title}</div>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {item.category ? <Badge variant='outline'>{issueCategoryLabel(item.category) || item.category}</Badge> : null}
                      {item.immediateHazard ? (
                        <Badge className='bg-red-600 text-white'>
                          <TbAlertTriangle /> Immediate hazard
                        </Badge>
                      ) : null}
                      {item.outOfService ? (
                        <Badge className='bg-red-100 text-red-800' data-testid='scan-issue-oos-flag'>
                          Marked out of service
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={'rounded px-2 py-0.5 text-xs font-bold capitalize ' + (PRIORITY_CLASS[item.priority] || '')}>{item.priority}</span>
                  </TableCell>
                  <TableCell className='text-sm'>{item.reporter}</TableCell>
                  <TableCell>
                    {item.capaNumber ? (
                      canOpenCapa && item.capaId ? (
                        <Link href={`/corrective-actions/${item.capaId}`} className='text-primary font-semibold' data-testid='scan-issue-capa-link'>
                          {item.capaNumber}
                        </Link>
                      ) : (
                        <span className='font-semibold'>{item.capaNumber}</span>
                      )
                    ) : (
                      <span className='text-textSecondary text-sm'>Not opened</span>
                    )}
                    {item.capaStatus ? <div className='text-textSecondary text-xs capitalize'>{item.capaStatus.replace(/_/g, ' ')}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div className='flex gap-1'>
                      {item.photos.map((photo, index) =>
                        photo.url ? (
                          <a key={index} href={photo.url} target='_blank' rel='noreferrer' title={photo.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.url} alt={photo.name} className='h-12 w-12 rounded border object-cover' data-testid='scan-issue-thumb' />
                          </a>
                        ) : (
                          <span key={index} className='text-textSecondary text-xs'>
                            {photo.name}
                          </span>
                        )
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className='text-textSecondary p-6'>No issues have been reported from a scan yet.</p>
        )}
      </CardContent>
    </Card>

    {items.length >= limit ? <p className='text-textSecondary text-sm'>Showing the {limit} most recent reports.</p> : null}
  </div>
)

export default ScanIssueList
