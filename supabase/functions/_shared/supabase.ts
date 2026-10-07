import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createServiceClient(): SupabaseClient {
  // Local `functions serve` overwrites SUPABASE_URL with the empty local stack.
  // SNAG_SUPABASE_URL lets that process use the real project database instead.
  return createClient(
    Deno.env.get("SNAG_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SNAG_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
