// Third-party Imports
import { createReader } from '@keystatic/core/reader'

// Config Imports
import keystaticConfig from '@repo/keystatic/configs/keystaticConfig'

export const createKeystaticReader = () => {
  return createReader(process.cwd(), keystaticConfig)
}
