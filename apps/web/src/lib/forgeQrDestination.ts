// Turns a recorded QR scan destination path into a label people can read.
// Scan routes send people to one of three asset pages (see app/q/[token]/route.ts).
export const describeQrDestination = (path: string | null | undefined, assetName?: string | null) => {
  if (!path) return '—'

  const target = assetName ? ' · ' + assetName : ''

  if (/^\/assets\/[^/]+\/maintenance\/create\/?$/.test(path)) return 'Log maintenance' + target
  if (/^\/assets\/[^/]+\/meter-readings\/create\/?$/.test(path)) return 'Record meter reading' + target
  if (/^\/assets\/[^/]+\/?$/.test(path)) return 'Open asset' + target

  return path
}
