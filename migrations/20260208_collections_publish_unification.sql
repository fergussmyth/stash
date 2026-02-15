-- Stash v3 unification: published collections on trips (collections-first social model).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'collection_visibility'
  ) THEN
    CREATE TYPE collection_visibility AS ENUM ('private', 'unlisted', 'public');
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.trips
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS visibility collection_visibility NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_slug text,
  ADD COLUMN IF NOT EXISTS is_ranked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ranked_size integer,
  ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_saved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_list_id uuid REFERENCES public.lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regclass('public.trips') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trips_public_slug_format'
      AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_public_slug_format
      CHECK (
        public_slug IS NULL
        OR public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trips_ranked_size_consistent'
      AND conrelid = 'public.trips'::regclass
  ) THEN
    ALTER TABLE public.trips
      ADD CONSTRAINT trips_ranked_size_consistent
      CHECK (
        (is_ranked = false AND ranked_size IS NULL)
        OR (is_ranked = true AND ranked_size IN (5, 10))
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS trips_owner_public_slug_unique
  ON public.trips (owner_id, public_slug)
  WHERE public_slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trips_source_list_unique
  ON public.trips (source_list_id)
  WHERE source_list_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS trips_visibility_explore_idx
  ON public.trips (visibility, save_count DESC, view_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS trips_owner_visibility_idx
  ON public.trips (owner_id, visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS public.trip_saves (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  saved_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id)
);

CREATE INDEX IF NOT EXISTS trip_saves_trip_time_idx
  ON public.trip_saves (trip_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trip_saves_saved_trip_idx
  ON public.trip_saves (saved_trip_id);

CREATE TABLE IF NOT EXISTS public.trip_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  referrer text
);

CREATE INDEX IF NOT EXISTS trip_views_trip_time_idx
  ON public.trip_views (trip_id, viewed_at DESC);

CREATE OR REPLACE FUNCTION public._trips_increment_save_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trips
  SET
    save_count = save_count + 1,
    last_saved_at = now()
  WHERE id = NEW.trip_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._trips_decrement_save_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trips
  SET save_count = GREATEST(save_count - 1, 0)
  WHERE id = OLD.trip_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public._trips_increment_view_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trips
  SET
    view_count = view_count + 1,
    last_viewed_at = now()
  WHERE id = NEW.trip_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trip_saves_after_insert_metrics'
  ) THEN
    CREATE TRIGGER trip_saves_after_insert_metrics
      AFTER INSERT ON public.trip_saves
      FOR EACH ROW
      EXECUTE FUNCTION public._trips_increment_save_metrics();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trip_saves_after_delete_metrics'
  ) THEN
    CREATE TRIGGER trip_saves_after_delete_metrics
      AFTER DELETE ON public.trip_saves
      FOR EACH ROW
      EXECUTE FUNCTION public._trips_decrement_save_metrics();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trip_views_after_insert_metrics'
  ) THEN
    CREATE TRIGGER trip_views_after_insert_metrics
      AFTER INSERT ON public.trip_views
      FOR EACH ROW
      EXECUTE FUNCTION public._trips_increment_view_metrics();
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.trips') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'trips'
        AND column_name = 'updated_at'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trips_set_updated_at'
    )
  THEN
    CREATE TRIGGER trips_set_updated_at
      BEFORE UPDATE ON public.trips
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trip_views ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trips'
      AND policyname = 'trips_published_read'
  ) THEN
    CREATE POLICY trips_published_read ON public.trips
      FOR SELECT
      TO anon, authenticated
      USING (
        visibility IN ('public', 'unlisted')
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = owner_id
            AND p.is_public = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_items'
      AND policyname = 'trip_items_published_read'
  ) THEN
    CREATE POLICY trip_items_published_read ON public.trip_items
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.trips t
          JOIN public.profiles p ON p.id = t.owner_id
          WHERE t.id = trip_items.trip_id
            AND t.visibility IN ('public', 'unlisted')
            AND p.is_public = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_saves'
      AND policyname = 'trip_saves_insert_own'
  ) THEN
    CREATE POLICY trip_saves_insert_own ON public.trip_saves
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND (
          saved_trip_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.trips st
            WHERE st.id = trip_saves.saved_trip_id
              AND st.owner_id = auth.uid()
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_saves.trip_id
            AND (
              t.owner_id = auth.uid()
              OR (
                t.visibility IN ('public', 'unlisted')
                AND EXISTS (
                  SELECT 1
                  FROM public.profiles p
                  WHERE p.id = t.owner_id
                    AND p.is_public = true
                )
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_saves'
      AND policyname = 'trip_saves_select_own'
  ) THEN
    CREATE POLICY trip_saves_select_own ON public.trip_saves
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_saves'
      AND policyname = 'trip_saves_delete_own'
  ) THEN
    CREATE POLICY trip_saves_delete_own ON public.trip_saves
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_saves'
      AND policyname = 'trip_saves_update_saved_trip_own'
  ) THEN
    CREATE POLICY trip_saves_update_saved_trip_own ON public.trip_saves
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (
        user_id = auth.uid()
        AND (
          saved_trip_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.trips st
            WHERE st.id = trip_saves.saved_trip_id
              AND st.owner_id = auth.uid()
          )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_views'
      AND policyname = 'trip_views_insert'
  ) THEN
    CREATE POLICY trip_views_insert ON public.trip_views
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        (viewer_user_id IS NULL OR viewer_user_id = auth.uid())
        AND EXISTS (
          SELECT 1
          FROM public.trips t
          WHERE t.id = trip_views.trip_id
            AND (
              t.owner_id = auth.uid()
              OR (
                t.visibility IN ('public', 'unlisted')
                AND EXISTS (
                  SELECT 1
                  FROM public.profiles p
                  WHERE p.id = t.owner_id
                    AND p.is_public = true
                )
              )
            )
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.lists') IS NULL OR to_regclass('public.trips') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.trips (
    owner_id,
    name,
    type,
    visibility,
    published_at,
    public_slug,
    subtitle,
    is_ranked,
    ranked_size,
    cover_image_url,
    save_count,
    view_count,
    last_saved_at,
    last_viewed_at,
    source_list_id,
    created_at,
    updated_at,
    pinned
  )
  SELECT
    l.owner_user_id,
    COALESCE(NULLIF(l.title, ''), 'Collection'),
    COALESCE(l.section::text, 'general'),
    CASE COALESCE(l.visibility::text, 'private')
      WHEN 'public' THEN 'public'::collection_visibility
      WHEN 'unlisted' THEN 'unlisted'::collection_visibility
      ELSE 'private'::collection_visibility
    END,
    CASE WHEN l.visibility = 'private' THEN NULL ELSE COALESCE(l.created_at, now()) END,
    l.slug,
    l.subtitle,
    COALESCE(l.is_ranked, false),
    l.ranked_size,
    l.cover_image_url,
    COALESCE(l.save_count, 0),
    COALESCE(l.view_count, 0),
    l.last_saved_at,
    l.last_viewed_at,
    l.id,
    COALESCE(l.created_at, now()),
    COALESCE(l.updated_at, now()),
    CASE WHEN l.pinned_order IS NULL THEN false ELSE true END
  FROM public.lists l
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.trips t
    WHERE t.source_list_id = l.id
  );
END
$$;

DO $$
BEGIN
  IF to_regclass('public.list_items') IS NULL OR to_regclass('public.trip_items') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.trip_items (
    trip_id,
    url,
    original_url,
    normalized_url,
    domain,
    platform,
    item_type,
    image_url,
    metadata,
    pinned,
    archived,
    title,
    note,
    added_at
  )
  SELECT
    t.id AS trip_id,
    li.url,
    li.url AS original_url,
    lower(regexp_replace(regexp_replace(COALESCE(li.url, ''), '^https?://(www\\.)?', ''), '/+$', '')) AS normalized_url,
    COALESCE(
      li.domain_snapshot,
      NULLIF(lower(regexp_replace(COALESCE(li.url, ''), '^https?://(www\\.)?([^/]+).*$' , '\\2')), '')
    ) AS domain,
    CASE WHEN li.url ILIKE '%airbnb.%' THEN 'airbnb' ELSE NULL END AS platform,
    'link' AS item_type,
    li.image_snapshot,
    jsonb_strip_nulls(
      COALESCE(li.meta_json, '{}'::jsonb) || jsonb_build_object(
        'source', 'legacy_list_migration',
        'source_list_id', li.list_id,
        'source_list_item_id', li.id,
        'source_rank_index', li.rank_index
      )
    ) AS metadata,
    false AS pinned,
    false AS archived,
    COALESCE(NULLIF(li.title_snapshot, ''), NULLIF(li.domain_snapshot, ''), 'Saved link') AS title,
    li.note,
    COALESCE(li.created_at, now()) AS added_at
  FROM public.list_items li
  JOIN public.trips t ON t.source_list_id = li.list_id
  ON CONFLICT (trip_id, normalized_url) DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION public.get_trending_collections(
  p_section text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  type text,
  name text,
  subtitle text,
  public_slug text,
  cover_image_url text,
  visibility collection_visibility,
  is_ranked boolean,
  ranked_size integer,
  save_count integer,
  view_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  owner_handle text,
  owner_display_name text,
  owner_avatar_url text,
  saves_last_7_days bigint,
  views_last_7_days bigint,
  trending_score bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH save_counts AS (
    SELECT
      ts.trip_id,
      count(*)::bigint AS saves_last_7_days
    FROM public.trip_saves ts
    WHERE ts.created_at >= (now() - interval '7 days')
    GROUP BY ts.trip_id
  ),
  view_counts AS (
    SELECT
      tv.trip_id,
      count(*)::bigint AS views_last_7_days
    FROM public.trip_views tv
    WHERE tv.viewed_at >= (now() - interval '7 days')
    GROUP BY tv.trip_id
  ),
  candidate AS (
    SELECT
      t.id,
      t.owner_id,
      t.type,
      t.name,
      t.subtitle,
      t.public_slug,
      t.cover_image_url,
      t.visibility,
      t.is_ranked,
      t.ranked_size,
      t.save_count,
      t.view_count,
      t.created_at,
      t.updated_at,
      t.last_saved_at,
      t.last_viewed_at,
      p.handle AS owner_handle,
      p.display_name AS owner_display_name,
      p.avatar_url AS owner_avatar_url,
      COALESCE(sc.saves_last_7_days, 0) AS saves_last_7_days,
      COALESCE(vc.views_last_7_days, 0) AS views_last_7_days
    FROM public.trips t
    JOIN public.profiles p ON p.id = t.owner_id
    LEFT JOIN save_counts sc ON sc.trip_id = t.id
    LEFT JOIN view_counts vc ON vc.trip_id = t.id
    WHERE t.visibility = 'public'
      AND p.is_public = true
      AND (
        p_section IS NULL
        OR p_section = ''
        OR t.type = p_section
      )
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR t.name ILIKE '%' || p_search || '%'
        OR COALESCE(t.subtitle, '') ILIKE '%' || p_search || '%'
        OR p.handle ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    c.id,
    c.owner_id,
    c.type,
    c.name,
    c.subtitle,
    c.public_slug,
    c.cover_image_url,
    c.visibility,
    c.is_ranked,
    c.ranked_size,
    c.save_count,
    c.view_count,
    c.created_at,
    c.updated_at,
    c.owner_handle,
    c.owner_display_name,
    c.owner_avatar_url,
    c.saves_last_7_days,
    c.views_last_7_days,
    (c.saves_last_7_days * 3 + c.views_last_7_days) AS trending_score
  FROM candidate c
  ORDER BY
    (c.saves_last_7_days * 3 + c.views_last_7_days) DESC,
    GREATEST(
      COALESCE(c.last_saved_at, 'epoch'::timestamptz),
      COALESCE(c.last_viewed_at, 'epoch'::timestamptz),
      c.created_at
    ) DESC,
    c.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 24), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_trending_collections(text, text, integer, integer) TO anon, authenticated;
