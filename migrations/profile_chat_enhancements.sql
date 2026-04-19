-- ================================================================
-- ViaChat — Profile & Chat Enhancements Migration
-- Run this in Supabase SQL Editor
-- ================================================================

-- Add 'about' / bio column to users (safe - IF NOT EXISTS)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS about TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT; -- alias

-- Add 'reply_to' JSONB column to chat_messages for threaded replies
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS reply_to JSONB DEFAULT NULL;

-- Add index for fast message lookup by sender
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_id, timestamp DESC);

-- Add notifications preference columns for users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notif_calls BOOLEAN DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notif_messages BOOLEAN DEFAULT true;

-- Enable realtime for video_chat_queue (may already be done)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.video_chat_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure video_chat_queue exists with correct schema
CREATE TABLE IF NOT EXISTS public.video_chat_queue (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  peer_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  matched_with TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  matched_peer TEXT
);

-- Enable RLS on video_chat_queue
ALTER TABLE public.video_chat_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "vcq_select" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_insert" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_update" ON public.video_chat_queue;
  DROP POLICY IF EXISTS "vcq_delete" ON public.video_chat_queue;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "vcq_select" ON public.video_chat_queue FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "vcq_insert" ON public.video_chat_queue FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "vcq_update" ON public.video_chat_queue FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "vcq_delete" ON public.video_chat_queue FOR DELETE USING (auth.uid()::text = user_id);
