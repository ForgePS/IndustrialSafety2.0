// Third-party Imports
import { TbChartBar, TbCurrencyDollar, TbReceipt, TbRefresh, TbShoppingCart, TbUsers } from 'react-icons/tb'

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
    title: 'Monthly Active Users',
    stats: '8.25k',
    percentage: 15.4,
    icon: <TbUsers className='text-2xl' />
  },
  {
    title: 'Customer Churn Rate',
    stats: '2.8%',
    percentage: -1.2,
    icon: <TbChartBar className='text-2xl' />
  },
  {
    title: 'Monthly Recurring Revenue (MRR)',
    stats: '$12.5k',
    percentage: 12.7,
    icon: <TbReceipt className='text-2xl' />
  },
  {
    title: 'Average Revenue Per User (ARPU)',
    stats: '$45.67',
    percentage: 8.9,
    icon: <TbCurrencyDollar className='text-2xl' />
  },
  {
    title: 'Average Order value',
    stats: '$295.00',
    percentage: 5.4,
    icon: <TbShoppingCart className='text-2xl' />
  },
  {
    title: 'Refunds',
    stats: '12',
    percentage: -6.3,
    icon: <TbRefresh className='text-2xl' />
  }
]

const AdminPage = () => {
  return (
    <div className='flex flex-col gap-y-8'>
      <header>
        <h1 className='text-3xl font-bold'>Dashboard</h1>
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
        <UsersTable />
        <MRRGrowthChart />
      </section>
    </div>
  )
}

export default AdminPage
