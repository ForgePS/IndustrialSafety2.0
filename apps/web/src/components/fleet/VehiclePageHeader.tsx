import { TbTruck } from 'react-icons/tb'

import FleetTabs, { type FleetTabKey } from './FleetTabs'

/** Port slice 11: title, subtitle, actions and the fleet tab row for the vehicle registry pages. */
const VehiclePageHeader = ({
  active,
  permissions,
  title = 'Fleet',
  subtitle,
  actions
}: {
  active: FleetTabKey
  permissions: string[]
  title?: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}) => (
  <>
    <div className='flex flex-wrap items-end justify-between gap-4'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbTruck />
          {title}
        </h1>
        <p className='text-textSecondary mt-2'>{subtitle || 'Vehicles, drivers, DVIRs, maintenance and renewals.'}</p>
      </div>
      {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
    </div>
    <FleetTabs active={active} permissions={permissions} />
  </>
)

export default VehiclePageHeader
