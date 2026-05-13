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
-- Explicit grants (required from Oct 30 2026 for all projects;
-- required now for new projects created after May 30 2026).
-- ---------------------------------------------------------

-- purchases
-- anon  → SELECT only, needed for realtime postgres_changes subscriptions
-- authenticated → not used (no user auth in this app)
-- service_role → full access for server-side API routes
GRANT SELECT                           ON public.purchases      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE   ON public.purchases      TO service_role;

-- mosaic_stats view (read-only aggregate)
GRANT SELECT ON public.mosaic_stats    TO anon;
GRANT SELECT ON public.mosaic_stats    TO service_role;

-- cell_counter (server-side only — atomic cell allocation)
GRANT SELECT, UPDATE                   ON public.cell_counter   TO service_role;

-- allocate_cells stored procedure (called by the webhook server route)
GRANT EXECUTE ON FUNCTION public.allocate_cells(integer) TO service_role;

-- ---------------------------------------------------------
-- Realtime: enable so the frontend can subscribe to new uploads
-- ---------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE purchases;

-- ---------------------------------------------------------
-- Cell counter — atomic allocation of grid positions.
-- A single row tracks the next available cell index.
-- The UPDATE is row-locked, so concurrent purchases never
-- receive the same cell slots.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_counter (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  next_cell  INTEGER NOT NULL DEFAULT 0
);
-- Seed the counter (only insert if the row doesn't exist)
INSERT INTO cell_counter (id, next_cell) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Stored procedure called by the webhook to atomically claim N cells.
CREATE OR REPLACE FUNCTION allocate_cells(n_cells INTEGER)
RETURNS INTEGER[]
LANGUAGE plpgsql
AS $$
DECLARE
  start_cell INTEGER;
  indices    INTEGER[];
BEGIN
  -- Lock the counter row and advance it
  UPDATE cell_counter
  SET    next_cell = next_cell + n_cells
  WHERE  id = 1
  RETURNING next_cell - n_cells INTO start_cell;

  -- Return the array of assigned indices
  SELECT ARRAY(SELECT generate_series(start_cell, start_cell + n_cells - 1))
  INTO indices;

  RETURN indices;
END;
$$;
