import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

function createDummyClient(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(
        'Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).'
      );
    },
  };
  return new Proxy({}, handler) as SupabaseClient;
}

/**
 * Backend Supabase client using service role key (bypasses RLS for administrative DB operations).
 * If environment variables are not yet configured, returns a dummy client.
 */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseServiceKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : createDummyClient();
