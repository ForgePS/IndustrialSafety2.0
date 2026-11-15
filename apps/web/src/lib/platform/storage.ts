import { createServiceRoleClient } from '@repo/supabase/server'

/**
 * File storage for 2.0 server code. Every upload, download, signed link and delete goes through here,
 * so moving into 1.0's AWS swaps this driver for S3 without touching modules
 * (docs/INTEGRATION_2X_INTO_1X_PLAN.md). Callers authorize access before calling; the driver does not.
 *
 * Buckets are logical names. On Supabase they are Storage buckets; on S3 they become key prefixes.
 */
export type StorageBucket = 'forge-evidence' | 'forge-support' | 'forge-training' | 'forge-wc-forms'

export type StorageError = { message: string }

export type SignedUrlOptions = {

  /** Serve as a download with this file name. Leave out to let the browser show the file inline. */
  downloadAs?: string
}

export interface StorageDriver {
  upload(bucket: StorageBucket, path: string, body: ArrayBuffer | Uint8Array | Blob, contentType: string): Promise<{ error: StorageError | null }>
  remove(bucket: StorageBucket, paths: string[]): Promise<{ error: StorageError | null }>
  createSignedUrl(bucket: StorageBucket, path: string, expiresInSeconds: number, options?: SignedUrlOptions): Promise<{ url: string | null; error: StorageError | null }>
  download(bucket: StorageBucket, path: string): Promise<{ bytes: Uint8Array | null; error: StorageError | null }>
}

const asError = (error: { message?: string } | null | undefined): StorageError | null => (error ? { message: error.message || 'Storage request failed.' } : null)

const supabaseDriver: StorageDriver = {
  async upload(bucket, path, body, contentType) {
    const { error } = await (createServiceRoleClient() as any).storage.from(bucket).upload(path, body, { contentType, upsert: false })

    return { error: asError(error) }
  },

  async remove(bucket, paths) {
    const { error } = await (createServiceRoleClient() as any).storage.from(bucket).remove(paths)

    return { error: asError(error) }
  },

  async createSignedUrl(bucket, path, expiresInSeconds, options = {}) {
    const { data, error } = await (createServiceRoleClient() as any).storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds, options.downloadAs ? { download: options.downloadAs } : undefined)

    return { url: data?.signedUrl ?? null, error: asError(error) || (data?.signedUrl ? null : { message: 'No signed URL returned.' }) }
  },

  async download(bucket, path) {
    const { data, error } = await (createServiceRoleClient() as any).storage.from(bucket).download(path)

    if (error || !data) return { bytes: null, error: asError(error) || { message: 'File not found.' } }

    return { bytes: new Uint8Array(await data.arrayBuffer()), error: null }
  }
}

const drivers: Record<string, StorageDriver> = { supabase: supabaseDriver }

/** The configured driver. FORGE_STORAGE_PROVIDER selects it; only `supabase` exists until the S3 driver lands. */
export const storage = (): StorageDriver => {
  const name = process.env.FORGE_STORAGE_PROVIDER || 'supabase'
  const driver = drivers[name]

  if (!driver) throw new Error(`Unknown FORGE_STORAGE_PROVIDER "${name}".`)

  return driver
}
