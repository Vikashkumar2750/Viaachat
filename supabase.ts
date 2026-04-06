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
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
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
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
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
  console.error(`Supabase Error [${context}]:`, error.message || error);
}
