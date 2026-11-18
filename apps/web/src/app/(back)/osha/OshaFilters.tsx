import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

/** Plain GET form so filters work without client JavaScript and stay in the URL. */
const OshaFilters = ({
  action,
  year,
  years,
  locationId,
  locations,
  allowAllLocations = true
}: {
  action: string
  year: number
  years: number[]
  locationId: string | null
  locations: Array<{ id: string; name: string; code: string | null }>
  allowAllLocations?: boolean
}) => (
  <Card>
    <CardContent className='p-5'>
      <form method='get' action={action} className='grid gap-4 md:grid-cols-[160px_1fr_auto] md:items-end'>
        <label className='flex flex-col gap-2 text-sm'>
          <span className='text-textSecondary'>Year</span>
          <select name='year' defaultValue={String(year)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            {years.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className='flex flex-col gap-2 text-sm'>
          <span className='text-textSecondary'>Establishment</span>
          <select name='location' defaultValue={locationId || ''} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            {allowAllLocations ? <option value=''>All establishments</option> : null}
            {locations.map(item => (
              <option key={item.id} value={item.id}>{item.code ? `${item.name} (${item.code})` : item.name}</option>
            ))}
          </select>
        </label>
        <Button type='submit' variant='outline'>Apply</Button>
      </form>
    </CardContent>
  </Card>
)

export default OshaFilters
