/** Port slice 15: tabs for the Contractor Safety section. */
export const contractorTabs = ({ canSignIn, canSettings }: { canSignIn: boolean; canSettings: boolean }) => [
  { key: 'companies', label: 'Companies', href: '/contractors' },
  ...(canSignIn ? [{ key: 'on-site', label: 'On site', href: '/contractors/on-site' }] : []),
  ...(canSettings ? [{ key: 'settings', label: 'Settings', href: '/contractors/settings' }] : [])
]
