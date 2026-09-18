import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

export async function signIn(email, password){
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password, username, fullName=''){
  const r = await supabase.auth.signUp({ email, password, options: { data: { username, full_name: fullName } } });
  return r;
}

export async function signOut(){ return supabase.auth.signOut(); }
