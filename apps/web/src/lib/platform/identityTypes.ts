/**
 * The signed-in person as 2.0 code sees them, whatever system signed them in. Kept free of server
 * imports so client components can use the type.
 *
 * `user_metadata` keeps the field names 2.0 already reads (name, user_avatar, avatar_url, and the
 * legacy JWT roles/permissions). Each identity driver fills it from its own claims.
 */
export type PlatformUser = {
  id: string
  email: string | null

  // As loosely typed as Supabase's own user_metadata, so existing readers keep compiling.
  // Fields read today: name, user_avatar, avatar_url, roles, permissions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata: Record<string, any>
}
