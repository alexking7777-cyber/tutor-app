import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Use only in Server Actions / Route Handlers.
 * Required to provision `households` + `parents` on signup before RLS INSERT policies exist.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for signup provisioning",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
