-- Viaachat Migration: Swipe-to-reply support
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Add reply_to JSONB column to chat_messages
-- Stores: { id: string, text: string, sender: string }
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS reply_to jsonb DEFAULT NULL;

-- Index for faster lookups (optional but good practice)
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON chat_messages USING gin(reply_to);
