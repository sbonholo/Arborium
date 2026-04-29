-- ============================================================
-- Trump Mosaic — Supabase Schema
-- Run this in the Supabase SQL editor after creating your project.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------
-- Main purchases table
-- One row per Stripe checkout session.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id       TEXT        UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  amount_paid_cents       INTEGER     NOT NULL,          -- total charged, e.g. 200 = $2.00
  cells_purchased         INTEGER     NOT NULL DEFAULT 1,
  cell_indices            INTEGER[]   NOT NULL DEFAULT '{}',  -- assigned cell slots
  photo_uploaded          BOOLEAN     NOT NULL DEFAULT FALSE,
  photo_key               TEXT,                          -- R2 storage key
  photo_url               TEXT,                          -- public CDN URL
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at             TIMESTAMPTZ
);

-- Index for fast lookups by session
CREATE INDEX IF NOT EXISTS idx_purchases_session ON purchases (stripe_session_id);

-- Index for mosaic rendering (only uploaded photos)
CREATE INDEX IF NOT EXISTS idx_purchases_uploaded ON purchases (photo_uploaded) WHERE photo_uploaded = TRUE;

-- ---------------------------------------------------------
-- Handy stats view
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW mosaic_stats AS
SELECT
  COUNT(*)                              AS total_purchases,
  COALESCE(SUM(cells_purchased), 0)     AS total_cells_filled,
  COALESCE(SUM(amount_paid_cents), 0) / 100.0  AS total_revenue_usd
FROM purchases
WHERE photo_uploaded = TRUE;

-- ---------------------------------------------------------
-- Row-level security
-- Allow public SELECT on uploaded photos (for the mosaic display).
-- All writes go through the service role key (server-side only).
-- ---------------------------------------------------------
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read uploaded photos"
  ON purchases FOR SELECT
  USING (photo_uploaded = TRUE);

-- Service role bypasses RLS automatically; no extra policy needed for writes.

-- ---------------------------------------------------------
-- Realtime: enable so the frontend can subscribe to new uploads
-- ---------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;
