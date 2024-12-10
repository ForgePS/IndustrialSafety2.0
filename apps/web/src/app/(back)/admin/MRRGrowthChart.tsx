'use client'

// Third-party Imports
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@repo/ui/components/ui/chart'
import type { ChartConfig } from '@repo/ui/components/ui/chart'

// Vars
const chartData = [
  { month: 'January', MRR: 28 },
  { month: 'February', MRR: 40 },
  { month: 'March', MRR: 36 },
  { month: 'April', MRR: 52 },
  { month: 'May', MRR: 38 },
  { month: 'June', MRR: 60 }
]

const chartConfig = {
  MRR: {
    label: 'MRR',
    color: 'hsl(var(--success))'
  }
} satisfies ChartConfig

const MRRGrowthChart = () => {
  return (
    <Card className='max-lg:order-1 max-lg:col-span-3 max-md:col-span-full'>
      <CardHeader>
        <CardDescription className='font-medium'>MRR Growth Chart</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='bs-[300px] lg:bs-[260px] is-full'>
          <AreaChart data={chartData} margin={{ left: -20 }} className='is-full'>
            <CartesianGrid vertical={false} strokeWidth={1.5} strokeDasharray={9} />
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              tickFormatter={value => value.slice(0, 3)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickCount={5}
              tickMargin={12}
              tickFormatter={value => `${value}k`}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator='dot' className='border-border' />} />
            <defs>
              <linearGradient id='fillMRR' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor='var(--color-MRR)' stopOpacity={0.5} />
                <stop offset='100%' stopColor='var(--color-MRR)' stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey='MRR'
              type='natural'
              fill='url(#fillMRR)'
              fillOpacity={0.4}
              stroke='var(--color-MRR)'
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default MRRGrowthChart
