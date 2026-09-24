// Returns initials from a display string without allowing missing profile data to crash the UI.
export const getInitials = (value?: string | null): string => {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (!normalized) return 'U'

  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .reduce((response, word) => response + word.slice(0, 1), '')
}
