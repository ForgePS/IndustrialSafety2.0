// psql access for the portability tools, the same way the DB test suites connect:
// SUPABASE_DB_URL when set (CI), otherwise psql inside the local Supabase container.
const { execFileSync } = require('child_process')

const DB_CONTAINER = process.env.FORGE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const DATABASE_URL = process.env.SUPABASE_DB_URL || ''

// Runs psql with the given arguments against `database` (default: the app database).
const psql = (args, { database, input } = {}) => {
  const options = { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }

  if (DATABASE_URL) {
    const url = new URL(DATABASE_URL)

    if (database) url.pathname = '/' + database

    return execFileSync('psql', [url.toString(), ...args], options)
  }

  return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', ...(database ? ['-d', database] : []), ...args], options)
}

// One query; rows as arrays of strings.
const query = (sql, options) =>
  psql(['-At', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql], options)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split('\t'))

// A whole script from stdin, stopping at the first error.
const runScript = (sql, options) => psql(['-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { ...options, input: sql })

module.exports = { psql, query, runScript }
