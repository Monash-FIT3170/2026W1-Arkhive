import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Shared Supabase client for frontend authentication and RLS-protected queries.
 * Initialized with anon key.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl!, supabaseAnonKey!);
