// Node Imports
import fs from 'fs'

export const createKeystaticReader = async () => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { default: config } = await import('@repo/keystatic/keystaticConfig')
    const { createReader } = await import('@keystatic/core/reader')

    const reader = createReader(process.cwd(), config)

    try {
      fs.readdirSync(`${process.cwd()}/src/cms-content/categories`)
      fs.readdirSync(`${process.cwd()}/src/cms-content/posts`)
    } catch (error) {
      console.error('Error reading content:', error)
    }

    return reader
  } else {
    // we should never get here but the compiler requires the check
    // to ensure we don't parse the package at build time
    throw new Error()
  }
}
