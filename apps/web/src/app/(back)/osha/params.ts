/** Parses ?year= and ?location= for OSHA pages, constrained to what the viewer may see. */
export const parseOshaParams = (
  searchParams: Record<string, string | string[] | undefined>,
  allowedLocationIds: string[]
) => {
  const currentYear = new Date().getFullYear()
  const rawYear = Number(Array.isArray(searchParams.year) ? searchParams.year[0] : searchParams.year)
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= currentYear ? rawYear : currentYear

  const rawLocation = Array.isArray(searchParams.location) ? searchParams.location[0] : searchParams.location
  const locationId = rawLocation && allowedLocationIds.includes(rawLocation) ? rawLocation : null

  // OSHA requires keeping logs for five years after the year they cover (1904.33).
  const years = Array.from({ length: 6 }, (_, index) => currentYear - index)

  return { year, locationId, years }
}
