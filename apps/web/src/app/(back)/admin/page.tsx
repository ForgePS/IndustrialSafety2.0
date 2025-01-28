// Third-party Imports
import { TbChartBar, TbCurrencyDollar, TbReceipt, TbRefresh, TbShoppingCart, TbUsers } from 'react-icons/tb'
import { createClient } from '@repo/supabase/server'
import Trans from '@repo/i18n/Trans'

// Components Imports
import CardStats from './CardStats'
import ChurnRateChart from './ChurnRateChart'
import MRRChart from './MRRChart'
import ActiveSubscriptionsChart from './ActiveSubscriptionsChart'
import SalesByCountries from './SalesByCountries'
import UsersTable from './UsersTable'
import MRRGrowthChart from './MRRGrowthChart'

// Vars
const data = [
  {
    title: <Trans i18nKey='admin:monthlyActiveUsers' />,
    stats: '8.25k',
    percentage: 15.4,
    icon: <TbUsers className='text-2xl' />
  },
  {
    title: <Trans i18nKey='admin:customerChurnRate' />,
    stats: '2.8%',
    percentage: -1.2,
    icon: <TbChartBar className='text-2xl' />
  },
  {
    title: <Trans i18nKey='admin:monthlyRecurringRevenue' />,
    stats: '$12.5k',
    percentage: 12.7,
    icon: <TbReceipt className='text-2xl' />
  },
  {
    title: <Trans i18nKey='admin:averageRevenuePerUser' />,
    stats: '$45.67',
    percentage: 8.9,
    icon: <TbCurrencyDollar className='text-2xl' />
  },
  {
    title: <Trans i18nKey='admin:averageOrderValue' />,
    stats: '$295.00',
    percentage: 5.4,
    icon: <TbShoppingCart className='text-2xl' />
  },
  {
    title: <Trans i18nKey='admin:refunds' />,
    stats: '12',
    percentage: -6.3,
    icon: <TbRefresh className='text-2xl' />
  }
]

const AdminPage = async () => {
  // Vars
  const supabase = await createClient()

  const { data: usersRecord, error: userError } = await supabase
    .from('users')
    .select('*')
    .order('id', { ascending: true, nullsFirst: false })

  if (userError) {
    console.error('Error fetching users: ', userError.message)

    return
  }

  const { data: rolesData, error: rolesError } = await supabase.from('user_roles').select(`*, roles (role)`)

  if (rolesError) {
    console.error('Error fetching roles: ', rolesError.message)

    return
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <header>
        <h1 className='text-3xl font-bold'>
          <Trans i18nKey='admin:dashboardTitle' />
        </h1>
      </header>

      <section className='grid grid-cols-6 gap-6 lg:grid-cols-3'>
        {data.slice(0, 3).map((item, index) => {
          return <CardStats key={index} data={item} className='max-lg:col-span-2 max-md:col-span-full' />
        })}
        <ChurnRateChart />
        <MRRChart />
        <div className='grid gap-6 max-lg:order-1 max-lg:col-span-full max-lg:grid-cols-3'>
          {data.slice(3).map((item, index) => {
            return <CardStats key={index} data={item} className='max-md:col-span-full' />
          })}
        </div>
        <ActiveSubscriptionsChart />
        <SalesByCountries />
        <UsersTable usersRecord={usersRecord} rolesData={rolesData} />
        <MRRGrowthChart />
      </section>
    </div>
  )
}

export default AdminPage
