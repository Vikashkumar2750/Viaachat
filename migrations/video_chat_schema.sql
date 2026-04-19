-- ============================================================
--  VIAACHAT — Random Video Chat Schema
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ── Video Chat Waiting Room ─────────────────────────────────
-- Users insert themselves here when they click "Start".
-- Matchmaking logic (in VideoChat.tsx) reads the oldest
-- available row to find a partner, then both rows are deleted.

CREATE TABLE IF NOT EXISTS public.video_chat_queue (
  id            uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_id       text          NOT NULL,             -- PeerJS peer ID for WebRTC handshake
  display_name  text          NOT NULL DEFAULT '',
  avatar_url    text          NOT NULL DEFAULT '',
  joined_at     timestamptz   NOT NULL DEFAULT now(),
  matched_with  uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_peer  text          -- partner's PeerJS peer ID (set when a match is made)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_video_chat_queue_joined_at   ON public.video_chat_queue (joined_at);
CREATE INDEX IF NOT EXISTS idx_video_chat_queue_matched_with ON public.video_chat_queue (matched_with);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE public.video_chat_queue ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the queue (to find waiting partners)
CREATE POLICY "video_queue_select" ON public.video_chat_queue
  FOR SELECT TO authenticated USING (true);

-- Users can only insert/update/delete their OWN row
CREATE POLICY "video_queue_insert" ON public.video_chat_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "video_queue_update" ON public.video_chat_queue
  FOR UPDATE TO authenticated USING (
    auth.uid() = user_id OR auth.uid() = matched_with
  );

CREATE POLICY "video_queue_delete" ON public.video_chat_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ── Realtime ─────────────────────────────────────────────────
-- Enable realtime on this table so VideoChat.tsx can subscribe
-- to changes without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_chat_queue;
