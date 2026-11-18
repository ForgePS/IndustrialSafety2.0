'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { IconType } from 'react-icons'
import {
  TbAlertTriangle,
  TbBan,
  TbChevronRight,
  TbCircleCheck,
  TbClipboardCheck,
  TbClipboardList,
  TbExternalLink,
  TbFileText,
  TbHistory,
  TbLock,
  TbLockAccess
} from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { identifyScanEmployeeAction, recordScanOpen, setScanServiceStatusAction, signOutScanEmployeeAction } from '@/app/scan/[token]/actions'
import type { ScanAction, ScanActionId } from '@/lib/forgeScanRules'

/**
 * Port slice 10: the scan menu body (Industrial 1.0 scan-public-workspace). Big tappable actions, the
 * employee-number panel and the out of service / return to service forms. Every server action
 * re-checks the viewer and action from the token.
 */

type ViewerSummary = { kind: 'anonymous' | 'employee' | 'user'; name: string | null }

const ICONS: Record<ScanActionId, IconType> = {
  report_issue: TbAlertTriangle,
  inspect_daily: TbClipboardCheck,
  inspect_weekly: TbClipboardCheck,
  inspect_monthly: TbClipboardCheck,
  out_of_service: TbBan,
  return_to_service: TbCircleCheck,
  history: TbHistory,
  view_loto: TbLockAccess,
  fill_form: TbFileText,
  open_record: TbExternalLink,
  dvir_pre_trip: TbClipboardList,
  dvir_post_trip: TbClipboardList
}

/** ?next= key for actions that live on their own scan page. */
const NEXT_KEYS: Partial<Record<ScanActionId, string>> = {
  report_issue: 'report',
  inspect_daily: 'inspect-daily',
  inspect_weekly: 'inspect-weekly',
  inspect_monthly: 'inspect-monthly',
  history: 'history',
  dvir_pre_trip: 'dvir-pre_trip',
  dvir_post_trip: 'dvir-post_trip'
}

const NEXT_LABELS: Record<string, string> = {
  report: 'report an issue',
  'inspect-daily': 'start the daily inspection',
  'inspect-weekly': 'start the weekly inspection',
  'inspect-monthly': 'start the monthly inspection',
  history: 'see the equipment history',
  'dvir-pre_trip': 'fill out the pre-trip DVIR',
  'dvir-post_trip': 'fill out the post-trip DVIR'
}

const nextSubPath = (next: string | null) =>
  next === 'report'
    ? 'report'
    : next === 'history'
      ? 'history'
      : next?.startsWith('inspect-')
        ? 'inspect/' + next.slice(8)
        : next === 'dvir-pre_trip' || next === 'dvir-post_trip'
          ? 'dvir/' + next.slice(5)
          : ''

const actionHref = (token: string, action: ScanAction) => {
  if (action.id === 'report_issue') return `/scan/${token}/report`
  if (action.frequency) return `/scan/${token}/inspect/${action.frequency}`
  if (action.id === 'history') return `/scan/${token}/history`

  return action.href || null
}

const tileClass = 'flex min-h-[72px] w-full items-center gap-4 rounded-lg border-2 p-4 text-left transition-colors'

const Tile = ({ action, locked, lockText }: { action: ScanAction; locked?: boolean; lockText?: string }) => {
  const Icon = locked ? TbLock : ICONS[action.id]

  return (
    <>
      <Icon className={'size-8 shrink-0 ' + (locked ? 'text-textSecondary' : action.id === 'out_of_service' ? 'text-red-600' : 'text-primary')} aria-hidden />
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='text-textPrimary text-lg font-bold leading-tight'>{action.label}</span>
        <span className='text-textSecondary text-sm'>{locked ? lockText : action.description}</span>
      </span>
      <TbChevronRight className='text-textSecondary size-6 shrink-0' aria-hidden />
    </>
  )
}

const ServiceStatusForm = ({ token, status, onDone, onCancel }: { token: string; status: 'out_of_service' | 'active'; onDone: (message: string) => void; onCancel: () => void }) => {
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const outOfService = status === 'out_of_service'

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (outOfService && !reason.trim()) {
      setError('Enter the reason it is out of service.')

      return
    }

    startTransition(async () => {
      const result = await setScanServiceStatusAction(token, { status, reason, notes })

      if (result.error) setError(result.error)
      else onDone(result.message || 'Saved.')
    })
  }

  return (
    <form
      onSubmit={submit}
      className={'flex flex-col gap-3 rounded-lg border-2 p-4 ' + (outOfService ? 'border-red-600' : 'border-green-600')}
      data-testid={outOfService ? 'scan-oos-form' : 'scan-rts-form'}
    >
      <h3 className='text-textPrimary text-lg font-bold'>{outOfService ? 'Mark out of service' : 'Return to service'}</h3>
      {outOfService ? (
        <div>
          <Label htmlFor='scan-oos-reason'>What is wrong? (required)</Label>
          <Input id='scan-oos-reason' className='mt-1 h-12 text-base' maxLength={500} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} />
        </div>
      ) : (
        <p className='text-textSecondary text-sm'>Only return it to service when the problem is fixed and it is safe to use.</p>
      )}
      <div>
        <Label htmlFor='scan-status-notes'>Notes (optional)</Label>
        <Textarea id='scan-status-notes' className='mt-1' rows={3} maxLength={2000} value={notes} disabled={pending} onChange={event => setNotes(event.target.value)} />
      </div>
      {error ? (
        <div role='alert' className='border-destructive text-destructive rounded-md border p-3 text-sm'>
          {error}
        </div>
      ) : null}
      <div className='flex gap-2'>
        <Button type='submit' size='lg' variant={outOfService ? 'solidDestructive' : 'solid'} disabled={pending} className='flex-1'>
          {pending ? 'Saving...' : outOfService ? 'Mark out of service' : 'Return to service'}
        </Button>
        <Button type='button' size='lg' variant='outline' disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

const IdentifyPanel = ({ token, next, inputRef }: { token: string; next: string | null; inputRef: React.RefObject<HTMLInputElement> }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await identifyScanEmployeeAction(token, employeeNumber, next)

      if (result.error) {
        setError(result.error)

        return
      }

      setEmployeeNumber('')

      if (result.redirectTo && result.redirectTo !== `/scan/${token}`) router.push(result.redirectTo)
      else {
        router.replace(`/scan/${token}`)
        router.refresh()
      }
    })
  }

  return (
    <form id='scan-identify' onSubmit={submit} className='bg-card flex scroll-mt-4 flex-col gap-3 rounded-lg border p-4' data-testid='scan-identify'>
      <div>
        <Label htmlFor='scan-employee-number' className='text-base font-semibold'>
          Enter your employee number
        </Label>
        <p className='text-textSecondary text-sm'>{next && NEXT_LABELS[next] ? `Then you can ${NEXT_LABELS[next]}.` : 'To report, inspect or tag out what you scanned.'}</p>
        <Input
          id='scan-employee-number'
          ref={inputRef}
          className='mt-2 h-14 text-2xl'
          autoComplete='off'
          inputMode='text'
          value={employeeNumber}
          disabled={pending}
          onChange={event => setEmployeeNumber(event.target.value)}
        />
      </div>
      {error ? (
        <div role='alert' className='border-destructive text-destructive rounded-md border p-3 text-sm' data-testid='scan-identify-error'>
          {error}
        </div>
      ) : null}
      <Button type='submit' size='lg' disabled={pending || !employeeNumber.trim()}>
        {pending ? 'Checking...' : 'Continue'}
      </Button>
    </form>
  )
}

const ScanMenu = ({
  token,
  actions,
  viewer,
  canIdentify,
  signInRequired,
  otherCompanyUser,
  initialNext
}: {
  token: string
  actions: ScanAction[]
  viewer: ViewerSummary

  /** Anonymous viewer on a QR that accepts employee numbers. */
  canIdentify: boolean

  /** Anonymous viewer on a signed-in-only QR. */
  signInRequired: boolean

  /** Signed in, but not a member of this QR's company. */
  otherCompanyUser: boolean
  initialNext: string | null
}) => {
  const router = useRouter()
  const [open, setOpen] = useState<'out_of_service' | 'active' | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [next, setNext] = useState<string | null>(initialNext)
  const [signingOut, startSignOut] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const logged = useRef(false)

  useEffect(() => {
    if (logged.current) return
    logged.current = true
    void recordScanOpen(token)
  }, [token])

  useEffect(() => {
    if (initialNext && canIdentify) inputRef.current?.focus()
  }, [initialNext, canIdentify])

  const loginHref = (sub = nextSubPath(next)) => '/auth/login?next=' + encodeURIComponent(`/scan/${token}${sub ? '/' + sub : ''}`)

  const unlockByIdentify = (action: ScanAction) => {
    setNext(NEXT_KEYS[action.id] || null)
    document.getElementById('scan-identify')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    inputRef.current?.focus()
  }

  const done = (message: string) => {
    setOpen(null)
    setConfirmation(message)
    router.refresh()
  }

  return (
    <div className='flex flex-col gap-4'>
      {confirmation ? (
        <div role='status' className='flex items-start gap-2 rounded-lg border-2 border-green-600 bg-green-50 p-4 text-green-900' data-testid='scan-confirmation'>
          <TbCircleCheck className='mt-0.5 size-5 shrink-0' aria-hidden />
          <span className='flex-1'>{confirmation}</span>
          <button type='button' className='text-sm font-semibold underline' onClick={() => setConfirmation(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {otherCompanyUser ? (
        <p className='text-textSecondary rounded-md border p-3 text-sm'>Your Forge sign-in is for a different company, so you are using this QR code as a visitor.</p>
      ) : null}

      {signInRequired ? (
        <div className='bg-card flex flex-col gap-3 rounded-lg border p-4' data-testid='scan-sign-in-required'>
          <p className='text-textPrimary font-semibold'>Sign in to Forge to use this QR code.</p>
          <Button asChild size='lg'>
            <Link href={loginHref()}>Sign in</Link>
          </Button>
        </div>
      ) : null}

      {canIdentify ? <IdentifyPanel token={token} next={next} inputRef={inputRef} /> : null}

      {viewer.kind === 'employee' ? (
        <p className='text-textSecondary text-sm' data-testid='scan-employee'>
          Not {viewer.name}?{' '}
          <button
            type='button'
            className='text-primary font-semibold underline'
            disabled={signingOut}
            onClick={() =>
              startSignOut(async () => {
                await signOutScanEmployeeAction(token)
                setConfirmation(null)
                router.refresh()
              })
            }
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </p>
      ) : null}

      {!actions.length ? (
        <p className='text-textSecondary rounded-lg border p-6 text-center' data-testid='scan-no-actions'>
          Nothing is available on this QR code right now.
        </p>
      ) : null}

      <ul className='flex flex-col gap-3' data-testid='scan-actions'>
        {actions.map(action => {
          const key = action.id + (action.formTemplateId || '')
          const testId = 'scan-action-' + action.id

          if (action.locked) {
            const lockText = action.locked === 'identify' ? 'Enter your employee number to use this.' : 'Sign in to use this.'

            return (
              <li key={key}>
                {action.locked === 'identify' && canIdentify ? (
                  <button type='button' className={tileClass + ' bg-muted/40 border-dashed'} data-testid={testId} data-locked='identify' onClick={() => unlockByIdentify(action)}>
                    <Tile action={action} locked lockText={lockText} />
                  </button>
                ) : (
                  <Link
                    href={loginHref(nextSubPath(NEXT_KEYS[action.id] || null))}
                    className={tileClass + ' bg-muted/40 border-dashed'}
                    data-testid={testId}
                    data-locked='sign_in'
                  >
                    <Tile action={action} locked lockText='Sign in to use this.' />
                  </Link>
                )}
              </li>
            )
          }

          if (action.id === 'out_of_service' || action.id === 'return_to_service') {
            const status = action.id === 'out_of_service' ? 'out_of_service' : 'active'

            return (
              <li key={key}>
                {open === status ? (
                  <ServiceStatusForm token={token} status={status} onDone={done} onCancel={() => setOpen(null)} />
                ) : (
                  <button
                    type='button'
                    className={tileClass + ' bg-card ' + (status === 'out_of_service' ? 'border-red-600/60 hover:bg-red-50' : 'border-green-600/60 hover:bg-green-50')}
                    data-testid={testId}
                    onClick={() => {
                      setConfirmation(null)
                      setOpen(status)
                    }}
                  >
                    <Tile action={action} />
                  </button>
                )}
              </li>
            )
          }

          const href = actionHref(token, action)

          return href ? (
            <li key={key}>
              <Link href={href} className={tileClass + ' bg-card hover:bg-primary/5 border-primary/40'} data-testid={testId}>
                <Tile action={action} />
              </Link>
            </li>
          ) : null
        })}
      </ul>

      {viewer.kind === 'anonymous' && canIdentify ? (
        <p className='text-textSecondary text-center text-sm'>
          Have a Forge login?{' '}
          <Link className='text-primary font-semibold underline' href={loginHref()}>
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  )
}

export default ScanMenu
