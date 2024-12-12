// Third-party Imports
import type { PlopTypes } from '@turbo/gen'

// Generator Imports
import { keystaticAdminGenerator } from './templates/keystatic/generator'

const generator = (plop: PlopTypes.NodePlopAPI): void => {
  keystaticAdminGenerator(plop)
}

export default generator
