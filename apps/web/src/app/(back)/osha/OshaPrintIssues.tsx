import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import type { OshaPrintIssue } from '@/lib/forgeOshaRules'

/** "Fix before printing": recordable cases with missing or inconsistent Form 300 fields (1.0 form300PrintIssues). */
const OshaPrintIssues = ({ issues, year }: { issues: OshaPrintIssue[]; year: number }) => {
  if (!issues.length) return null

  return (
    <Card className='border-warning' data-testid='osha-print-issues'>
      <CardHeader>
        <CardTitle>Fix before printing</CardTitle>
        <CardDescription>
          {issues.length === 1 ? 'One case' : `${issues.length} cases`} on the {year} log {issues.length === 1 ? 'has' : 'have'} missing or
          inconsistent fields. The Form 300 log and 300A totals may be incomplete until {issues.length === 1 ? 'it is' : 'they are'} fixed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='flex flex-col gap-3'>
          {issues.map(item => (
            <li key={item.caseId} className='border-b pb-3 last:border-b-0' data-testid={`osha-print-issue-${item.caseId}`}>
              <Link className='text-primary font-semibold hover:underline' href={`/osha/cases/${item.caseId}`}>
                {item.label}
              </Link>
              <ul className='text-textSecondary mt-1 list-disc ps-5 text-sm'>
                {item.issues.map(issue => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export default OshaPrintIssues
