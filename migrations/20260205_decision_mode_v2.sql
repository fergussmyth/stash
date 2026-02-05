-- Decision mode v2 fields for trips + trip_items

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_status') THEN
    CREATE TYPE decision_status AS ENUM ('none', 'in_progress', 'decided');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'decision_state') THEN
    CREATE TYPE decision_state AS ENUM ('active', 'ruled_out', 'chosen');
  END IF;
END$$;

ALTER TABLE IF EXISTS public.trips
  ADD COLUMN IF NOT EXISTS decision_status decision_status NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS decision_dismissed boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS public.trip_items
  ADD COLUMN IF NOT EXISTS decision_state decision_state NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS ruled_out_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS chosen_at timestamptz NULL;

UPDATE public.trips
SET decision_status = 'none'
WHERE decision_status IS NULL;

UPDATE public.trip_items
SET decision_state = 'active'
WHERE decision_state IS NULL;
