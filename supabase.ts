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
// IMPORTANT: flowType is NOT set to 'pkce' here.
// PKCE is for OAuth redirect flows only. Setting it globally causes the GoTrue
// auth lock to misfire during anonymous sign-in, causing it to hang indefinitely.
// Google OAuth redirect still works correctly with the default implicit flow for SPAs.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,   // picks up #access_token hash from Google OAuth
      storageKey: 'viaachat-auth-token',
      storage: window.localStorage,
      // flowType intentionally omitted — defaults to 'implicit' which works for
      // SPAs, anonymous sign-in, email/password, AND Google OAuth redirect
      debug: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
      worker: true, // Keeps WebSocket heartbeat alive even when tab is backgrounded
    },
    global: {
      headers: { 'x-application-name': 'viaachat' },
    },
  }
);


// ===========================
// AUTH HELPERS
// ===========================

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
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
 * Anonymous (Guest) sign-in — fast path.
 *
 * Strategy:
 * 1. If already have a valid anonymous session → return it instantly (no network call)
 * 2. If stale anon session detected → clear storage and sign in fresh
 * 3. On any GoTrue lock timeout → clear storage and retry once
 */
export async function signInAsGuest() {
  // ── Fast path: reuse existing anonymous session ───────────────────────────
  // getSession() reads from localStorage — no network call needed
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && session.user.is_anonymous) {
      return { user: session.user, session };
    }
  } catch {}

  // ── Sign in anonymously with single retry on lock timeout ─────────────────
  const attempt = async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data;
  };

  try {
    // First attempt: wrap with a 5s timeout to detect lock hang
    const result = await Promise.race([
      attempt(),
      new Promise<null>(r => setTimeout(() => r(null), 5000)),
    ]);

    if (result !== null) return result; // success

    // ── Lock timeout hit: clear stale auth storage and retry ─────────────────
    console.warn('[guest] signInAnonymously timed out — clearing auth storage & retrying');
    try {
      localStorage.removeItem('viaachat-auth-token');
      localStorage.removeItem('viaachat-auth-token-code-verifier'); // PKCE remnant
    } catch {}

    // Retry directly — no timeout wrapper this time
    return await attempt();

  } catch (err: any) {
    // Map Supabase "not enabled" error to friendly message
    if (
      err?.message?.toLowerCase().includes('anonymous') ||
      err?.message?.includes('not enabled') ||
      err?.status === 422
    ) {
      throw new Error(
        'Anonymous login is not enabled. Go to Supabase Dashboard → Authentication → Providers → Anonymous Sign-ins and enable it.'
      );
    }
    throw err;
  }
}

export async function signOut() {
  // Clear PKCE remnant keys too (may exist from previous build)
  try {
    localStorage.removeItem('viaachat-auth-token-code-verifier');
  } catch {}
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}


// ===========================
// USER SYNC
// ===========================

/**
 * Upsert the authenticated user into public.users.
 * FIRE-AND-FORGET: callers should NOT await this in auth state handlers
 * to keep the login UI instant. The DB write happens in the background.
 */
export async function syncUser(authUser: { id: string; email?: string | null; user_metadata?: any }) {
  const isAnon = (authUser as any).is_anonymous === true;
  const displayName =
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    authUser.email?.split('@')[0] ||
    (isAnon ? `Guest_${authUser.id.slice(0, 6)}` : `User_${authUser.id.slice(0, 6)}`);

  const photoUrl =
    authUser.user_metadata?.avatar_url ||
    authUser.user_metadata?.picture ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`;

  const { error } = await supabase.from('users').upsert(
    {
      id: authUser.id,
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

// Set last_seen to Unix epoch — instantly appears offline to all presence checks.
// Called on visibilitychange(hidden) and pagehide so the user goes offline the
// moment they switch tabs or close the app — no 2-minute stale window.
export async function setUserOffline(userId: string) {
  if (!userId) return;
  await supabase
    .from('users')
    .update({ last_seen: new Date(0).toISOString() })
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
