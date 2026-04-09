-- ================================================================
-- VIAACHAT Room System v2 — Migration
-- Run in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ================================================================

-- ── Extend rooms table ───────────────────────────────────────────────────────
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS category       TEXT DEFAULT 'General';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS tags           TEXT[] DEFAULT '{}';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS room_type      TEXT DEFAULT 'public';  -- public | private | scheduled | locked
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS is_locked      BOOLEAN DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS co_hosts       TEXT[] DEFAULT '{}';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS raised_hands   TEXT[] DEFAULT '{}';
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS listener_count INT DEFAULT 0;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS scheduled_at  TIMESTAMPTZ;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS ended_at       TIMESTAMPTZ;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS pinned_msg_id  TEXT;

-- ── Hand raises table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hand_raises (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name   TEXT NOT NULL,
  user_avatar TEXT,
  raised_at   TIMESTAMPTZ DEFAULT now(),
  status      TEXT DEFAULT 'pending',   -- pending | accepted | rejected
  UNIQUE(room_id, user_id)
);

-- ── Room reactions table (emoji reactions) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_reactions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  emoji     TEXT NOT NULL,
  sent_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hand_raises_room ON public.hand_raises(room_id, status);
CREATE INDEX IF NOT EXISTS idx_room_reactions_room ON public.room_reactions(room_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_category ON public.rooms(category);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type ON public.rooms(room_type);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.hand_raises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_reactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "hand_raises_select" ON public.hand_raises;
  DROP POLICY IF EXISTS "hand_raises_insert" ON public.hand_raises;
  DROP POLICY IF EXISTS "hand_raises_update" ON public.hand_raises;
  DROP POLICY IF EXISTS "hand_raises_delete" ON public.hand_raises;
  DROP POLICY IF EXISTS "room_reactions_select" ON public.room_reactions;
  DROP POLICY IF EXISTS "room_reactions_insert" ON public.room_reactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "hand_raises_select" ON public.hand_raises FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "hand_raises_insert" ON public.hand_raises FOR INSERT WITH CHECK (auth.uid()::text = user_id);
CREATE POLICY "hand_raises_update" ON public.hand_raises FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "hand_raises_delete" ON public.hand_raises FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "room_reactions_select" ON public.room_reactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "room_reactions_insert" ON public.room_reactions FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Add to realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hand_raises;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.room_reactions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
