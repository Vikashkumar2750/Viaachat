import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-ref.supabase.co' &&
  supabaseAnonKey !== 'your-anon-key-here'
);

// Use placeholder values so createClient doesn't crash — real calls will fail gracefully
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // Unique storage key per app to avoid cross-tab lock conflicts
      storageKey: 'viaachat-auth-token',
      // Suppress Supabase's own console warning about dangling promises
      debug: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    // Increase global fetch timeout for slow networks
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
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
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
    },
  });
  if (error) throw error;
  return data;
}

export async function signInAsGuest() {
  // Race the anonymous sign-in against a 6-second timeout.
  // Without the timeout, a stuck auth lock makes this hang indefinitely.
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(
      'Guest sign-in timed out. Please enable Anonymous Auth in Supabase Dashboard → Authentication → Providers → Anonymous Sign-ins, then try again.'
    )), 6000)
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
      id: authUser.id,
      display_name: displayName,
      photo_url: photoUrl,
      email: authUser.email || null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('Error syncing user:', error.message);
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
  // Don't log auth lock errors — they're transient and non-critical
  if (error.message?.includes('Lock') || error.code === 'auth_lock_conflict') return;
  console.error(`Supabase Error [${context}]:`, error.message || error);
}
