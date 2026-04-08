-- ================================================================
-- VIAACHAT - Supabase PostgreSQL Schema v2
-- Run this in the Supabase SQL Editor AFTER enabling auth providers
-- This is an UPDATED version - safe to run on existing databases (IF NOT EXISTS)
-- ================================================================

-- ===========================
-- TABLES
-- ===========================

-- Users (synced from auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'User',
  photo_url TEXT,
  email TEXT,
  last_seen TIMESTAMPTZ DEFAULT now(),
  blocked_user_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chats (direct messages + groups)
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  avatar_url TEXT,
  is_group BOOLEAN NOT NULL DEFAULT false,
  participants TEXT[] NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_message TEXT,
  last_message_time TIMESTAMPTZ DEFAULT now(),
  unread_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  message_type TEXT DEFAULT 'text',
  description TEXT,
  admins TEXT[] DEFAULT '{}',
  pinned_message_ids TEXT[] DEFAULT '{}',
  is_muted BOOLEAN DEFAULT false,
  typing_status JSONB DEFAULT '{}'
);

-- Chat Messages (updated to support audio/image)
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 2000000), -- up to 2MB for base64 images/audio
  sender_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now(),
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'video', 'sticker', 'gif', 'image', 'audio', 'file')),
  is_pinned BOOLEAN DEFAULT false,
  reactions JSONB DEFAULT '{}'
);

-- Calls (1:1 call history)
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'outgoing' CHECK (type IN ('incoming', 'outgoing', 'missed')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  is_video BOOLEAN NOT NULL DEFAULT false,
  duration INTEGER DEFAULT 0
);

-- Call Signals (WebRTC signaling) - id matches calls.id for easy linking
CREATE TABLE IF NOT EXISTS public.call_signals (
  id TEXT PRIMARY KEY, -- matches calls.id UUID
  caller_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  offer JSONB,
  answer JSONB,
  status TEXT DEFAULT 'calling' CHECK (status IN ('calling', 'ringing', 'connected', 'ended', 'rejected')),
  is_video BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Call ICE Candidates
CREATE TABLE IF NOT EXISTS public.ice_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id TEXT NOT NULL REFERENCES public.call_signals(id) ON DELETE CASCADE,
  candidate JSONB NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('caller', 'receiver')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Random Call Matchmaking Queue
-- Users who click "Random Call" are added here. When two users are in the queue,
-- they are auto-matched and a call starts without any accept dialog.
CREATE TABLE IF NOT EXISTS public.call_queue (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  is_video BOOLEAN DEFAULT false,
  searching_since TIMESTAMPTZ DEFAULT now(),
  -- Populated when matched:
  matched_with TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  matched_name TEXT,
  matched_avatar TEXT,
  call_id TEXT
);


-- Statuses
CREATE TABLE IF NOT EXISTS public.statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  content_url TEXT, -- can store base64 for images
  text TEXT,
  background_color TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  viewed BOOLEAN DEFAULT false
);

-- Communities
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) < 100),
  description TEXT,
  avatar_url TEXT,
  groups_count INTEGER DEFAULT 3,
  created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Friend Requests
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  from_avatar_url TEXT,
  to_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  timestamp TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_id, to_id)
);

-- Rooms (Group Audio/Video Discussion Rooms)
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numeric_id SERIAL UNIQUE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) < 100),
  owner_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  admins TEXT[] DEFAULT '{}',
  seats JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  participant_count INTEGER DEFAULT 0,
  description TEXT,
  avatar_url TEXT,
  is_locked BOOLEAN DEFAULT false,
  banned_user_ids TEXT[] DEFAULT '{}',
  typing_status JSONB DEFAULT '{}'
);

-- Room Participants (who is currently in the room)
CREATE TABLE IF NOT EXISTS public.room_participants (
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  photo_url TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Room Messages
CREATE TABLE IF NOT EXISTS public.room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  text TEXT NOT NULL CHECK (char_length(text) <= 5000),
  timestamp TIMESTAMPTZ DEFAULT now(),
  mentions TEXT[] DEFAULT '{}'
);

-- ===========================
-- INDEXES (for performance)
-- ===========================

CREATE INDEX IF NOT EXISTS idx_chats_participants ON public.chats USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON public.chat_messages(chat_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.calls(caller_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calls_receiver ON public.calls(receiver_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON public.friend_requests(from_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON public.friend_requests(to_id);
CREATE INDEX IF NOT EXISTS idx_rooms_numeric_id ON public.rooms(numeric_id);
CREATE INDEX IF NOT EXISTS idx_rooms_owner ON public.rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON public.room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_messages_room ON public.room_messages(room_id, timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_statuses_timestamp ON public.statuses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_statuses_user ON public.statuses(user_id);
CREATE INDEX IF NOT EXISTS idx_ice_candidates_signal ON public.ice_candidates(signal_id, role);
CREATE INDEX IF NOT EXISTS idx_call_signals_ids ON public.call_signals(caller_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_call_signals_receiver ON public.call_signals(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON public.users(last_seen DESC);

-- ===========================
-- AUTO-CLEANUP: Old call signals (older than 1 hour)
-- ===========================
-- Run this periodically or use pg_cron if available
-- DELETE FROM public.call_signals WHERE created_at < now() - interval '1 hour';
-- DELETE FROM public.statuses WHERE timestamp < now() - interval '24 hours';

-- ===========================
-- ROW LEVEL SECURITY
-- ===========================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ice_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_queue ENABLE ROW LEVEL SECURITY;

-- ===========================
-- DROP OLD CONFLICTING POLICIES (safe to ignore errors)
-- ===========================

DO $$ BEGIN
  -- Users
  DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.users;
  DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
  -- Chats
  DROP POLICY IF EXISTS "Users can view own chats" ON public.chats;
  DROP POLICY IF EXISTS "Authenticated users can create chats" ON public.chats;
  DROP POLICY IF EXISTS "Participants can update chat" ON public.chats;
  DROP POLICY IF EXISTS "Participants can delete chat" ON public.chats;
  -- Messages
  DROP POLICY IF EXISTS "Participants can view messages" ON public.chat_messages;
  DROP POLICY IF EXISTS "Participants can send messages" ON public.chat_messages;
  DROP POLICY IF EXISTS "Participants can update reactions/pin" ON public.chat_messages;
  DROP POLICY IF EXISTS "Senders can delete own messages" ON public.chat_messages;
  -- Calls
  DROP POLICY IF EXISTS "Users can view their calls" ON public.calls;
  DROP POLICY IF EXISTS "Users can log calls" ON public.calls;
  DROP POLICY IF EXISTS "Users can update call duration" ON public.calls;
  -- Call Signals
  DROP POLICY IF EXISTS "Users can view their signals" ON public.call_signals;
  DROP POLICY IF EXISTS "Callers can create signals" ON public.call_signals;
  DROP POLICY IF EXISTS "Participants can update signals" ON public.call_signals;
  -- ICE
  DROP POLICY IF EXISTS "Authenticated users can view ice candidates" ON public.ice_candidates;
  DROP POLICY IF EXISTS "Authenticated users can insert ice candidates" ON public.ice_candidates;
  -- Statuses
  DROP POLICY IF EXISTS "Authenticated users can view statuses" ON public.statuses;
  DROP POLICY IF EXISTS "Users can create own status" ON public.statuses;
  DROP POLICY IF EXISTS "Users can update own status" ON public.statuses;
  DROP POLICY IF EXISTS "Users can delete own status" ON public.statuses;
  -- Communities
  DROP POLICY IF EXISTS "Authenticated can view communities" ON public.communities;
  DROP POLICY IF EXISTS "Authenticated can create communities" ON public.communities;
  DROP POLICY IF EXISTS "Creators can update communities" ON public.communities;
  DROP POLICY IF EXISTS "Creators can delete communities" ON public.communities;
  -- Friend Requests
  DROP POLICY IF EXISTS "Users can see their requests" ON public.friend_requests;
  DROP POLICY IF EXISTS "Users can send requests" ON public.friend_requests;
  DROP POLICY IF EXISTS "Recipients can update requests" ON public.friend_requests;
  DROP POLICY IF EXISTS "Users can delete own requests" ON public.friend_requests;
  -- Rooms
  DROP POLICY IF EXISTS "Authenticated can view rooms" ON public.rooms;
  DROP POLICY IF EXISTS "Authenticated can create rooms" ON public.rooms;
  DROP POLICY IF EXISTS "Anyone authenticated can update rooms" ON public.rooms;
  DROP POLICY IF EXISTS "Owners can delete rooms" ON public.rooms;
  -- Room Participants
  DROP POLICY IF EXISTS "Authenticated can view room participants" ON public.room_participants;
  DROP POLICY IF EXISTS "Users can join rooms" ON public.room_participants;
  DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_participants;
  DROP POLICY IF EXISTS "Participants can update presence" ON public.room_participants;
  -- Room Messages
  DROP POLICY IF EXISTS "Authenticated can view room messages" ON public.room_messages;
  DROP POLICY IF EXISTS "Authenticated can send room messages" ON public.room_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ===========================
-- CREATE POLICIES (clean set)
-- ===========================

-- Users
CREATE POLICY "users_select" ON public.users FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "users_insert" ON public.users FOR INSERT WITH CHECK (auth.uid()::text = id);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid()::text = id);

-- Chats
CREATE POLICY "chats_select" ON public.chats FOR SELECT USING (auth.uid()::text = ANY(participants));
CREATE POLICY "chats_insert" ON public.chats FOR INSERT WITH CHECK (auth.uid()::text = ANY(participants));
CREATE POLICY "chats_update" ON public.chats FOR UPDATE USING (auth.uid()::text = ANY(participants));
CREATE POLICY "chats_delete" ON public.chats FOR DELETE USING (auth.uid()::text = created_by OR auth.uid()::text = ANY(participants));

-- Chat Messages
CREATE POLICY "messages_select" ON public.chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.chats WHERE chats.id = chat_messages.chat_id AND auth.uid()::text = ANY(chats.participants))
);
CREATE POLICY "messages_insert" ON public.chat_messages FOR INSERT WITH CHECK (
  auth.uid()::text = sender_id AND
  EXISTS (SELECT 1 FROM public.chats WHERE chats.id = chat_messages.chat_id AND auth.uid()::text = ANY(chats.participants))
);
CREATE POLICY "messages_update" ON public.chat_messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.chats WHERE chats.id = chat_messages.chat_id AND auth.uid()::text = ANY(chats.participants))
);
-- Allow senders to delete their own messages
CREATE POLICY "messages_delete" ON public.chat_messages FOR DELETE USING (auth.uid()::text = sender_id);

-- Calls
CREATE POLICY "calls_select" ON public.calls FOR SELECT USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);
CREATE POLICY "calls_insert" ON public.calls FOR INSERT WITH CHECK (auth.uid()::text = caller_id);
CREATE POLICY "calls_update" ON public.calls FOR UPDATE USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);

-- Call Signals
CREATE POLICY "signals_select" ON public.call_signals FOR SELECT USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);
CREATE POLICY "signals_insert" ON public.call_signals FOR INSERT WITH CHECK (auth.uid()::text = caller_id);
CREATE POLICY "signals_update" ON public.call_signals FOR UPDATE USING (auth.uid()::text = caller_id OR auth.uid()::text = receiver_id);

-- ICE Candidates
CREATE POLICY "ice_select" ON public.ice_candidates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ice_insert" ON public.ice_candidates FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Statuses
CREATE POLICY "statuses_select" ON public.statuses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "statuses_insert" ON public.statuses FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "statuses_update" ON public.statuses FOR UPDATE USING (auth.uid()::text = user_id);
CREATE POLICY "statuses_delete" ON public.statuses FOR DELETE USING (auth.uid()::text = user_id);

-- Communities
CREATE POLICY "communities_select" ON public.communities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "communities_insert" ON public.communities FOR INSERT WITH CHECK (auth.uid()::text = created_by);
CREATE POLICY "communities_update" ON public.communities FOR UPDATE USING (auth.uid()::text = created_by);
CREATE POLICY "communities_delete" ON public.communities FOR DELETE USING (auth.uid()::text = created_by);

-- Friend Requests
CREATE POLICY "freq_select" ON public.friend_requests FOR SELECT USING (auth.uid()::text = from_id OR auth.uid()::text = to_id);
CREATE POLICY "freq_insert" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid()::text = from_id);
CREATE POLICY "freq_update" ON public.friend_requests FOR UPDATE USING (auth.uid()::text = to_id OR auth.uid()::text = from_id);
CREATE POLICY "freq_delete" ON public.friend_requests FOR DELETE USING (auth.uid()::text = from_id OR auth.uid()::text = to_id);

-- Rooms
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT WITH CHECK (auth.uid()::text = owner_id);
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_delete" ON public.rooms FOR DELETE USING (auth.uid()::text = owner_id);

-- Room Participants
CREATE POLICY "rparticipants_select" ON public.room_participants FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rparticipants_insert" ON public.room_participants FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "rparticipants_delete" ON public.room_participants FOR DELETE USING (auth.uid()::text = user_id);
CREATE POLICY "rparticipants_update" ON public.room_participants FOR UPDATE USING (auth.uid()::text = user_id);

-- Room Messages
CREATE POLICY "rmessages_select" ON public.room_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rmessages_insert" ON public.room_messages FOR INSERT WITH CHECK (auth.uid()::text = sender_id);

-- Call Queue
CREATE POLICY "queue_select" ON public.call_queue FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "queue_insert" ON public.call_queue FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "queue_update" ON public.call_queue FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "queue_delete" ON public.call_queue FOR DELETE USING (auth.uid()::text = user_id);

-- ===========================
-- REALTIME SUBSCRIPTIONS
-- ===========================

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ice_candidates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_queue;
