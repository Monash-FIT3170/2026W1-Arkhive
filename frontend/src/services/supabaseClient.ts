import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createDummyClient(): SupabaseClient {
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(
        'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing).'
      );
    },
  };
  return new Proxy({}, handler) as SupabaseClient;
}

/**
 * Shared Supabase client for frontend authentication and RLS-protected queries.
 * Initialized with anon key. If env vars aren't configured, returns a dummy
 * client that throws on use, so the module can still import cleanly (e.g. in CI/tests).
 */
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : createDummyClient();
