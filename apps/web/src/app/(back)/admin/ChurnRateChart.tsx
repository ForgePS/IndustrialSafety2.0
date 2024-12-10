'use client'

// Third-party Imports
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@repo/ui/components/ui/chart'
import type { ChartConfig } from '@repo/ui/components/ui/chart'

// Vars
const chartData = [
  { month: 'January', ChurnRate: 8.2 },
  { month: 'February', ChurnRate: 5.8 },
  { month: 'March', ChurnRate: 7.4 },
  { month: 'April', ChurnRate: 2.6 },
  { month: 'May', ChurnRate: 3.5 },
  { month: 'June', ChurnRate: 1.2 }
]

const chartConfig = {
  ChurnRate: {
    label: 'ChurnRate',
    color: 'hsl(var(--warning))'
  }
} satisfies ChartConfig

const ChurnRateChart = () => {
  return (
    <Card className='flex flex-col max-lg:col-span-3 max-md:col-span-full'>
      <CardHeader>
        <CardDescription className='font-medium'>Churn Rate</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 justify-center'>
        <ChartContainer config={chartConfig} className='bs-full is-full max-md:max-bs-64'>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: -15,
              right: 18
            }}
          >
            <CartesianGrid horizontal={false} strokeWidth={1.5} strokeDasharray={9} />
            <XAxis
              dataKey='month'
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={value => value.slice(0, 3)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickCount={5}
              tickMargin={8}
              tickFormatter={value => `${value}%`}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Line dataKey='ChurnRate' type='linear' stroke='var(--color-ChurnRate)' strokeWidth={2} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default ChurnRateChart
