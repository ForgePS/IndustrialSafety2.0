'use client'

// Third-party Imports
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@repo/ui/components/ui/chart'
import type { ChartConfig } from '@repo/ui/components/ui/chart'

// Vars
const chartData = [
  { month: 'January', MRR: 5 },
  { month: 'February', MRR: 8 },
  { month: 'March', MRR: 11 },
  { month: 'April', MRR: 13 },
  { month: 'May', MRR: 15 },
  { month: 'June', MRR: 18 },
  { month: 'July', MRR: 20 },
  { month: 'August', MRR: 22 }
]

const chartConfig = {
  MRR: {
    label: 'MRR',
    color: 'hsl(var(--primary))'
  }
} satisfies ChartConfig

const MRRChart = () => {
  return (
    <Card className='col-span-full max-lg:order-1 lg:col-span-2'>
      <CardHeader>
        <CardDescription className='font-medium'>Monthly Recurring Revenue</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className='bs-56 sm:bs-[300px] is-full'>
          <BarChart data={chartData} maxBarSize={35} margin={{ left: -10 }}>
            <CartesianGrid vertical={false} strokeWidth={1.5} strokeDasharray={9} />
            <XAxis
              dataKey='month'
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={value => value.slice(0, 3)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickCount={5}
              tickMargin={8}
              tickFormatter={value => `$${value}k`}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey='MRR' fill='var(--color-MRR)' radius={6}>
              <LabelList
                position='top'
                offset={8}
                formatter={(value: number) => `${value}k`}
                className='fill-textSecondary'
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default MRRChart
