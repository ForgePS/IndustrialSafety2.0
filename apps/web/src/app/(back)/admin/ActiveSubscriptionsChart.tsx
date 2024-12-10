'use client'

// Third-party Imports
import { Pie, PieChart } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader } from '@repo/ui/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from '@repo/ui/components/ui/chart'
import type { ChartConfig } from '@repo/ui/components/ui/chart'

type LabelProp = {
  cx: number
  cy: number
  percent: number
  midAngle: number
  innerRadius: number
  outerRadius: number
}

// Vars
const RADIAN = Math.PI / 180

const chartData = [
  { name: 'PlanA', value: 15, fill: 'var(--color-PlanA)' },
  { name: 'PlanB', value: 25, fill: 'var(--color-PlanB)' },
  { name: 'PlanC', value: 60, fill: 'var(--color-PlanC)' }
]

const chartConfig = {
  PlanA: {
    label: 'Plan A',
    color: 'hsl(var(--primary) / 0.6)'
  },
  PlanB: {
    label: 'Plan B',
    color: 'hsl(var(--primary) / 0.8)'
  },
  PlanC: {
    label: 'Plan C',
    color: 'hsl(var(--primary))'
  }
} satisfies ChartConfig

const renderCustomizedLabel = (props: LabelProp) => {
  // Props
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props

  // Vars
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text
      x={x}
      y={y}
      fill='#fff'
      textAnchor='middle'
      dominantBaseline='central'
      className='font-medium [text-shadow:_0_2px_2px_rgb(0_0_0_/_40%)] max-sm:text-xs'
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  )
}

const ActiveSubscriptionsChart = () => {
  return (
    <Card className='max-lg:col-span-3 max-md:col-span-full'>
      <CardHeader className='pbe-0'>
        <CardDescription className='font-medium'>Active Subscriptions</CardDescription>
      </CardHeader>
      <CardContent className='p-0'>
        <ChartContainer config={chartConfig} className='max-is-96 mli-auto aspect-square'>
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={chartData}
              dataKey='value'
              nameKey='name'
              innerRadius='50%'
              startAngle={90}
              endAngle={450}
              label={renderCustomizedLabel}
              labelLine={false}
            />
            <ChartLegend
              content={<ChartLegendContent nameKey='name' />}
              className='-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center'
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default ActiveSubscriptionsChart
