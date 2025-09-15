import { createClient } from '@supabase/supabase-js';

// prefer VITE_* vars but allow common fallbacks
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  import.meta.env.SUPABASE_URL ||
  '';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  '';

// warn early if missing
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel.');
}

let _supabase = null;
export function getSupabase() {
  if (_supabase) return _supabase;
  try {
    _supabase = createClient(String(SUPABASE_URL), String(SUPABASE_ANON_KEY));
    return _supabase;
  } catch (err) {
    console.error('Failed to create Supabase client', err);
    return null;
  }
}

// default export for existing imports
export const supabase = getSupabase();