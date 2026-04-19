-- ================================================================
-- ViaChat — Profile & Chat Enhancements Migration  (safe to re-run)
-- Run this in Supabase SQL Editor — each block is independent
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

-- ── 4. video_chat_queue table ────────────────────────────────────
--  user_id is TEXT (matches public.users.id which is TEXT, not UUID)
--  We intentionally do NOT use a foreign key here to avoid the
--  text = uuid operator error when auth.uid() (uuid) is compared
--  in RLS policies. The app enforces referential integrity in code.
CREATE TABLE IF NOT EXISTS public.video_chat_queue (
  user_id      TEXT PRIMARY KEY,
  peer_id      TEXT NOT NULL,
  display_name TEXT,
  avatar_url   TEXT,
  joined_at    TIMESTAMPTZ DEFAULT now(),
  matched_with TEXT,
  matched_peer TEXT
);

-- ── 5. Enable RLS on video_chat_queue ───────────────────────────
ALTER TABLE public.video_chat_queue ENABLE ROW LEVEL SECURITY;

-- ── 6. Drop old policies (safe — ignores if they don't exist) ───
DO $$ BEGIN
  DROP POLICY IF EXISTS "vcq_select" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_insert" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_update" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_delete" ON public.video_chat_queue;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 7. RLS policies — cast auth.uid() to text explicitly ─────────
--  auth.uid() returns uuid; user_id is text → must cast to match
CREATE POLICY "vcq_select" ON public.video_chat_queue
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "vcq_insert" ON public.video_chat_queue
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "vcq_update" ON public.video_chat_queue
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "vcq_delete" ON public.video_chat_queue
  FOR DELETE USING (auth.uid()::text = user_id);

-- ── 8. Realtime publication ──────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_chat_queue;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- already added, that's fine
END $$;
