// Third-party Imports
import { TbAlertTriangle, TbClipboardCheck, TbLock, TbShieldCheck } from 'react-icons/tb'
import type { IconType } from 'react-icons'

type Capability = { icon: IconType; title: string; detail: string }

const capabilities: Capability[] = [
  { icon: TbAlertTriangle, title: 'Incidents & observations', detail: 'Report from the floor in minutes, anonymously when needed.' },
  { icon: TbClipboardCheck, title: 'Inspections', detail: 'Checklists with findings that turn straight into corrective actions.' },
  { icon: TbLock, title: 'Lockout / Tagout', detail: 'Energy-isolation procedures, reviews and field use in one place.' },
  { icon: TbShieldCheck, title: 'Risk & JSAs', detail: 'Score hazards, set controls, and brief crews before work starts.' }
]

// The corrective-action loop every record feeds into; the order is the process.
const loop = ['Report', 'Investigate', 'Correct', 'Verify']

/** Sign-in side panel: what Forge does, in plain terms. Hidden below the lg breakpoint. */
const LeftSection = () => {
  return (
    <div className='bg-primary/5 relative basis-0 overflow-hidden lg:basis-3/5 xl:basis-2/3'>
      <div className='flex min-h-full flex-col justify-center gap-10 p-12 xl:p-16 max-lg:hidden'>
        <div className='flex max-w-xl flex-col gap-3'>
          <span className='text-primary text-sm font-semibold uppercase tracking-wider'>Forge Industrial Safety</span>
          <h2 className='text-textPrimary text-balance text-4xl font-bold leading-tight'>
            Every incident, inspection and lockout in one place.
          </h2>
          <p className='text-textSecondary text-lg'>
            Built for plant safety teams: capture hazards early, fix them properly, and prove it was done.
          </p>
        </div>

        <ul className='grid max-w-2xl grid-cols-2 gap-4' aria-label='What you can do in Forge'>
          {capabilities.map(({ icon: Icon, title, detail }) => (
            <li key={title} className='bg-card flex gap-3 rounded-lg border p-4'>
              <span className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md'>
                <Icon className='size-5' aria-hidden />
              </span>
              <span className='flex flex-col gap-0.5'>
                <span className='text-textPrimary font-semibold'>{title}</span>
                <span className='text-textSecondary text-sm'>{detail}</span>
              </span>
            </li>
          ))}
        </ul>

        <ol className='flex max-w-2xl flex-wrap items-center gap-2' aria-label='Corrective action loop'>
          {loop.map((step, index) => (
            <li key={step} className='flex items-center gap-2'>
              <span className='bg-card text-textPrimary flex items-center gap-2 rounded-full border py-1 pe-3 ps-1 text-sm font-medium'>
                <span className='bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full text-xs font-bold'>
                  {index + 1}
                </span>
                {step}
              </span>
              {index < loop.length - 1 ? <span className='text-textDisabled' aria-hidden>→</span> : null}
            </li>
          ))}
        </ol>
      </div>

      {/* Hazard-tape band along the bottom edge. */}
      <div
        className='absolute inset-x-0 bottom-0 h-3 opacity-80 max-lg:hidden'
        aria-hidden
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, #f2b705 0 14px, #1f2328 14px 28px)'
        }}
      />
    </div>
  )
}

export default LeftSection
