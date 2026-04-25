/**
 * @deprecated Prefer `@/lib/supabase/browser`, `@/lib/supabase/server`, or `@/lib/supabase/admin`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseBrowserClient as createBrowserSsr } from "@/lib/supabase/browser";

export function createSupabaseBrowserClient() {
  return createBrowserSsr();
}

/** Cookie-backed session (Server Components / Server Actions). */
export { createSupabaseServerClient } from "@/lib/supabase/server";

/** Service role — RLS bypass. */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  return createSupabaseAdminClient();
}
