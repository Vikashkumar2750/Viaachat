-- ================================================================
-- ViaChat — Profile & Chat Enhancements Migration  (safe to re-run)
-- Run this in Supabase SQL Editor
-- ================================================================

-- ── 1. User profile columns ──────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS about          TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notif_calls    BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notif_messages BOOLEAN DEFAULT true;

-- ── 2. Chat message threading ────────────────────────────────────
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;

-- ── 3. Performance index ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
  ON public.chat_messages(sender_id, timestamp DESC);

-- ── 4. video_chat_queue — drop + recreate to fix any UUID/TEXT mismatch ──
--  We drop OLD policies first (they may reference the wrong column type).
DO $$ BEGIN
  DROP POLICY IF EXISTS "vcq_select" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_insert" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_update" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_delete" ON public.video_chat_queue;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop and recreate the table to guarantee column types are correct.
-- CASCADE removes old FK constraints and policies automatically.
DROP TABLE IF EXISTS public.video_chat_queue CASCADE;

CREATE TABLE public.video_chat_queue (
  user_id      TEXT PRIMARY KEY,   -- TEXT, not UUID — matches public.users.id
  peer_id      TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  matched_with TEXT,               -- no FK — avoids text=uuid operator errors
  matched_peer TEXT
);

-- ── 5. Enable RLS ────────────────────────────────────────────────
ALTER TABLE public.video_chat_queue ENABLE ROW LEVEL SECURITY;

-- ── 6. RLS policies — cast BOTH sides to ::text to be type-safe ──
--  auth.uid() returns uuid; user_id is text.
--  Casting both sides avoids "operator does not exist: text = uuid".
CREATE POLICY "vcq_select" ON public.video_chat_queue
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "vcq_insert" ON public.video_chat_queue
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "vcq_update" ON public.video_chat_queue
  FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "vcq_delete" ON public.video_chat_queue
  FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- ── 7. Enable realtime ───────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_chat_queue;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already registered — that is fine
END $$;
