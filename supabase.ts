import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-ref.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key-here'
);

// ── Supabase client ──────────────────────────────────────────────────────────
// Key settings for reliable auth across page refreshes and OAuth callbacks:
//   persistSession: true  → stores session in localStorage so refresh works
//   detectSessionInUrl: true  → picks up #access_token from Google OAuth redirect
//   autoRefreshToken: true  → silently refreshes JWT before it expires
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'viaachat-auth-token',
      storage: window.localStorage,
      flowType: 'pkce', // More secure OAuth flow; also fixes redirect issues
      debug: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
    global: {
      headers: { 'x-application-name': 'viaachat' },
    },
  }
);


// ===========================
// AUTH HELPERS
// ===========================

/**
 * Google OAuth — redirects the user to Google, then back to the app.
 * IMPORTANT: Add https://viaachat.vercel.app/** to Supabase Dashboard →
 * Authentication → URL Configuration → Redirect URLs.
 */
export async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}/`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account', // let user pick their Google account
      },
      skipBrowserRedirect: false,
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: displayName },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Anonymous (Guest) sign-in.
 * Requires "Anonymous Sign-ins" enabled in Supabase Dashboard →
 * Authentication → Providers → Anonymous Sign-ins.
 */
export async function signInAsGuest() {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(
      'Guest sign-in timed out. Enable Anonymous Auth in Supabase Dashboard → Authentication → Providers → Anonymous Sign-ins.'
    )), 8000)
  );

  try {
    const { data, error } = await Promise.race([
      supabase.auth.signInAnonymously(),
      timeoutPromise,
    ]) as any;
    if (error) throw error;
    return data;
  } catch (err: any) {
    if (err?.message?.includes('not enabled') || err?.status === 422) {
      throw new Error(
        'Anonymous login is not enabled. Go to Supabase Dashboard → Authentication → Providers → Anonymous Sign-ins and enable it.'
      );
    }
    throw err;
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}


// ===========================
// USER SYNC
// ===========================

/**
 * Upsert the authenticated user into the public.users table.
 * Called on SIGNED_IN and when the profile is missing after INITIAL_SESSION.
 */
export async function syncUser(authUser: { id: string; email?: string | null; user_metadata?: any }) {
  const displayName =
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    authUser.email?.split('@')[0] ||
    `Guest_${authUser.id.slice(0, 6)}`;

  const photoUrl =
    authUser.user_metadata?.avatar_url ||
    authUser.user_metadata?.picture ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`;

  const { error } = await supabase.from('users').upsert(
    {
      id: authUser.id,         // TEXT primary key — UUID stored as text
      display_name: displayName,
      photo_url: photoUrl,
      email: authUser.email || null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('syncUser error:', error.message);
  }
}

export async function updateUserPresence(userId: string) {
  if (!userId) return;
  await supabase
    .from('users')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', userId);
}


// ===========================
// MESSAGING HELPERS
// ===========================

export async function markChatAsRead(chatId: string) {
  await supabase.from('chats').update({ unread_count: 0 }).eq('id', chatId);
}


// ===========================
// REALTIME CHANNEL FACTORY
// ===========================

export function createRealtimeChannel(name: string): RealtimeChannel {
  return supabase.channel(name);
}

export { RealtimeChannel };


// ===========================
// ERROR HANDLER
// ===========================

export function handleSupabaseError(error: any, context: string) {
  if (!error) return;
  if (error.message?.includes('Lock') || error.code === 'auth_lock_conflict') return;
  console.error(`Supabase Error [${context}]:`, error.message || error);
}
