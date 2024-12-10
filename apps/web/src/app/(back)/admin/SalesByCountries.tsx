// Third-party Imports
import { TbChevronDown, TbChevronUp, TbDotsVertical } from 'react-icons/tb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { cn } from '@repo/ui/lib/utils'

// Vars
const countries = [
  {
    title: '$8.45k',
    subtitle: 'United States',
    trendNumber: 25.8,
    imgSrc: '/images/flags/us.png'
  },
  {
    title: '$7.78k',
    subtitle: 'Brazil',
    trendNumber: 16.2,
    trend: 'negative',
    imgSrc: '/images/flags/brazil.png'
  },
  {
    title: '$6.48k',
    subtitle: 'India',
    trendNumber: 12.3,
    imgSrc: '/images/flags/india.png'
  },
  {
    title: '$5.12k',
    subtitle: 'Australia',
    trendNumber: 11.9,
    trend: 'negative',
    imgSrc: '/images/flags/australia.png'
  },
  {
    title: '$4.45k',
    subtitle: 'France',
    trendNumber: 16.2,
    imgSrc: '/images/flags/france.png'
  },
  {
    title: '$3.90k',
    subtitle: 'China',
    trendNumber: 14.8,
    imgSrc: '/images/flags/china.png'
  }
]

const SalesByCountries = () => {
  return (
    <Card className='max-lg:order-1 max-lg:col-span-3 max-md:col-span-full'>
      <CardHeader className='relative'>
        <CardTitle>Sales By Countries</CardTitle>
        <CardDescription className='text-textDisabled'>Monthly Sales Overview</CardDescription>
        <TbDotsVertical className='absolute end-6' />
      </CardHeader>
      <CardContent className='flex flex-col gap-[19px]'>
        {countries.map((item, index) => (
          <div key={index} className='flex items-center gap-4'>
            <img src={item.imgSrc} alt={item.subtitle} className='bs-10 is-10' />
            <div className='flex-1'>
              <h2 className='font-medium'>{item.title}</h2>
              <p className='text-textDisabled text-sm'>{item.subtitle}</p>
            </div>
            <div className='flex items-center gap-1'>
              {item.trend === 'negative' ? (
                <TbChevronDown className='text-destructive text-xl' />
              ) : (
                <TbChevronUp className='text-success text-xl' />
              )}
              <span
                className={cn('text-sm font-medium', item.trend === 'negative' ? 'text-destructive' : 'text-success')}
              >{`${item.trendNumber}%`}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default SalesByCountries
