// Runtime validation for model-produced JSON (tool arguments and structured outputs) against the
// strict JSON-schema subset Forge AI tools use: type (single or list), enum, properties, required,
// additionalProperties:false, items, minimum/maximum, minLength/maxLength, minItems/maxItems.
// The provider's strict mode is not trusted on its own; anything outside the schema is refused.
// Pure module, so Node tests can load it directly.

type Schema = Record<string, any>

const typeOf = (value: unknown) => {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'

  return typeof value
}

const typeMatches = (expected: string, actual: string) =>
  expected === actual || (expected === 'number' && actual === 'integer')

export const validateStrictJson = (schema: Schema, value: unknown, path = '$', errors: string[] = []): string[] => {
  if (errors.length >= 20) return errors

  const actual = typeOf(value)
  const allowed: string[] = schema.type == null ? [] : Array.isArray(schema.type) ? schema.type : [schema.type]

  if (allowed.length && !allowed.some(type => typeMatches(type, actual))) {
    errors.push(`${path} must be ${allowed.join(' or ')}, got ${actual}`)

    return errors
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option: unknown) => option === value)) {
    // A nullable enum field lists null in its type but not always in its enum.
    if (!(value === null && allowed.includes('null'))) {
      errors.push(`${path} must be one of ${schema.enum.map((option: unknown) => JSON.stringify(option)).join(', ')}`)
    }
  }

  if (actual === 'object') {
    const object = value as Record<string, unknown>
    const properties: Record<string, Schema> = schema.properties || {}

    for (const key of schema.required || []) {
      if (!(key in object)) errors.push(`${path}.${key} is required`)
    }

    for (const [key, child] of Object.entries(object)) {
      if (properties[key]) {
        validateStrictJson(properties[key], child, `${path}.${key}`, errors)
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is not allowed`)
      }
    }
  }

  if (actual === 'array') {
    const items = value as unknown[]

    if (schema.minItems != null && items.length < schema.minItems)
      errors.push(`${path} needs at least ${schema.minItems} items`)
    if (schema.maxItems != null && items.length > schema.maxItems)
      errors.push(`${path} allows at most ${schema.maxItems} items`)
    if (schema.items)
      items.forEach((item, index) => validateStrictJson(schema.items, item, `${path}[${index}]`, errors))
  }

  if (actual === 'integer' || actual === 'number') {
    const number = value as number

    if (schema.minimum != null && number < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`)
    if (schema.maximum != null && number > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`)
  }

  if (actual === 'string') {
    const text = value as string

    if (schema.minLength != null && text.length < schema.minLength)
      errors.push(`${path} must be at least ${schema.minLength} characters`)
    if (schema.maxLength != null && text.length > schema.maxLength)
      errors.push(`${path} must be at most ${schema.maxLength} characters`)
  }

  return errors
}

export type ParsedModelJson<T> = { ok: true; value: T } | { ok: false; errors: string[] }

// Parse a JSON string from the model and validate it. Never throws.
export const parseModelJson = <T = Record<string, unknown>>(
  raw: string | null | undefined,
  schema: Schema
): ParsedModelJson<T> => {
  let value: unknown

  try {
    value = JSON.parse(raw && raw.trim() ? raw : '{}')
  } catch {
    return { ok: false, errors: ['$ is not valid JSON'] }
  }

  const errors = validateStrictJson(schema, value)

  return errors.length ? { ok: false, errors } : { ok: true, value: value as T }
}
