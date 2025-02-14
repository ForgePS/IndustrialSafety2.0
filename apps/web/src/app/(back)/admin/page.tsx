// React Imports
import { Suspense } from 'react'

// Next Imports
import type { Metadata } from 'next'

// Third-party Imports
import { TbChartBar, TbCurrencyDollar, TbReceipt, TbRefresh, TbShoppingCart, TbUsers } from 'react-icons/tb'
import { getAllUserRoles, getUsers } from '@repo/supabase/serverHelpers'
import Loader from '@repo/ui/components/Loader'
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

export const metadata: Metadata = {
  title: 'Dashboard'
}

const AdminDashboardSection = async () => {
  // Vars
  const [{ data: usersRecord, error: userError }, { data: rolesData, error: rolesError }] = await Promise.all([
    getUsers(),
    getAllUserRoles('*, roles (role)')
  ])

  if (userError || rolesError) {
    console.error('Error fetching users or roles: ', userError?.message || rolesError?.message)

    return
  }

  return (
    <div className='flex flex-col gap-y-8'>
      <h1 className='text-textPrimary text-2xl font-bold sm:text-3xl'>
        <Trans i18nKey='admin:dashboardTitle' />
      </h1>

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

const AdminPage = () => {
  return (
    <Suspense fallback={<Loader />}>
      <AdminDashboardSection />
    </Suspense>
  )
}

export default AdminPage
