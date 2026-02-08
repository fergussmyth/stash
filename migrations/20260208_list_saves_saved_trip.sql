-- Phase 6 hotfix: persist destination Stash collection for saved public lists.

ALTER TABLE IF EXISTS public.list_saves
  ADD COLUMN IF NOT EXISTS saved_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS list_saves_saved_trip_idx
  ON public.list_saves (saved_trip_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'list_saves'
      AND policyname = 'list_saves_update_saved_trip_own'
  ) THEN
    CREATE POLICY list_saves_update_saved_trip_own ON public.list_saves
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND (
          saved_trip_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.trips t
            WHERE t.id = list_saves.saved_trip_id
              AND t.owner_id = auth.uid()
          )
        )
      );
  END IF;
END
$$;
