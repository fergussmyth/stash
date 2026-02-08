-- Stash v3 (social-first): public profiles + public lists + follows + saves/views

-- =========================
-- Types
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stash_section') THEN
    CREATE TYPE stash_section AS ENUM ('general', 'travel', 'fashion');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'list_visibility') THEN
    CREATE TYPE list_visibility AS ENUM ('private', 'unlisted', 'public');
  END IF;
END$$;

-- =========================
-- Profiles extensions (handle + bio + privacy)
-- =========================
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- If an email column exists (legacy), prevent it from being publicly selectable.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'email'
  ) THEN
    EXECUTE 'REVOKE SELECT (email) ON TABLE public.profiles FROM anon, authenticated';
  END IF;
END$$;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_handle_format'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_handle_format
      CHECK (
        handle IS NULL
        OR handle ~ '^[a-z0-9_]{3,24}$'
      );
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_unique
  ON public.profiles (handle)
  WHERE handle IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_is_public_idx
  ON public.profiles (is_public);

-- =========================
-- Lists
-- =========================
CREATE TABLE IF NOT EXISTS public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  section stash_section NOT NULL DEFAULT 'general',
  title text NOT NULL,
  subtitle text,
  slug text NOT NULL,
  cover_image_url text,
  visibility list_visibility NOT NULL DEFAULT 'private',
  is_ranked boolean NOT NULL DEFAULT false,
  ranked_size integer,
  pinned_order integer,
  save_count integer NOT NULL DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,
  last_saved_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lists_slug_format'
      AND conrelid = 'public.lists'::regclass
  ) THEN
    ALTER TABLE public.lists
      ADD CONSTRAINT lists_slug_format
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lists_ranked_size_consistent'
      AND conrelid = 'public.lists'::regclass
  ) THEN
    ALTER TABLE public.lists
      ADD CONSTRAINT lists_ranked_size_consistent
      CHECK (
        (is_ranked = false AND ranked_size IS NULL)
        OR (is_ranked = true AND ranked_size IN (5, 10))
      );
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS lists_owner_slug_unique
  ON public.lists (owner_user_id, slug);

CREATE UNIQUE INDEX IF NOT EXISTS lists_owner_pinned_order_unique
  ON public.lists (owner_user_id, pinned_order)
  WHERE pinned_order IS NOT NULL;

CREATE INDEX IF NOT EXISTS lists_owner_created_idx
  ON public.lists (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lists_explore_idx
  ON public.lists (visibility, save_count DESC, view_count DESC, created_at DESC);

-- =========================
-- List items (snapshotted)
-- =========================
CREATE TABLE IF NOT EXISTS public.list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  item_id uuid,
  url text NOT NULL,
  title_snapshot text,
  image_snapshot text,
  domain_snapshot text,
  price_snapshot text,
  rating_snapshot numeric,
  meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rank_index integer NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'list_items_rank_positive'
      AND conrelid = 'public.list_items'::regclass
  ) THEN
    ALTER TABLE public.list_items
      ADD CONSTRAINT list_items_rank_positive
      CHECK (rank_index > 0);
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS list_items_list_rank_unique
  ON public.list_items (list_id, rank_index);

CREATE INDEX IF NOT EXISTS list_items_list_id_idx
  ON public.list_items (list_id);

-- Optional FK (only if trip_items exists)
DO $$
BEGIN
  IF to_regclass('public.trip_items') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'list_items_item_id_fkey'
      AND conrelid = 'public.list_items'::regclass
  ) THEN
    ALTER TABLE public.list_items
      ADD CONSTRAINT list_items_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES public.trip_items(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Enforce ranked lists (Top 5 / Top 10)
CREATE OR REPLACE FUNCTION public._enforce_list_item_rank()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_ranked boolean;
  v_ranked_size integer;
  v_existing_count integer;
  v_reorder_context text;
BEGIN
  v_reorder_context := current_setting('stash.reorder_context', true);
  IF COALESCE(v_reorder_context, '') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT l.is_ranked, l.ranked_size
  INTO v_is_ranked, v_ranked_size
  FROM public.lists l
  WHERE l.id = NEW.list_id;

  IF v_is_ranked THEN
    IF v_ranked_size IS NOT NULL AND (NEW.rank_index < 1 OR NEW.rank_index > v_ranked_size) THEN
      RAISE EXCEPTION 'rank_index out of range for ranked list';
    END IF;

    IF TG_OP = 'INSERT' AND v_ranked_size IS NOT NULL THEN
      SELECT count(*) INTO v_existing_count
      FROM public.list_items li
      WHERE li.list_id = NEW.list_id;
      IF v_existing_count >= v_ranked_size THEN
        RAISE EXCEPTION 'ranked list is full';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'list_items_enforce_rank'
  ) THEN
    CREATE TRIGGER list_items_enforce_rank
      BEFORE INSERT OR UPDATE ON public.list_items
      FOR EACH ROW
      EXECUTE FUNCTION public._enforce_list_item_rank();
  END IF;
END$$;

-- =========================
-- Follows
-- =========================
CREATE TABLE IF NOT EXISTS public.follows (
  follower_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  following_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, following_user_id),
  CONSTRAINT follows_no_self CHECK (follower_user_id <> following_user_id)
);

CREATE INDEX IF NOT EXISTS follows_following_time_idx
  ON public.follows (following_user_id, created_at DESC);

-- =========================
-- List saves
-- =========================
CREATE TABLE IF NOT EXISTS public.list_saves (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, list_id)
);

CREATE INDEX IF NOT EXISTS list_saves_list_time_idx
  ON public.list_saves (list_id, created_at DESC);

-- =========================
-- Optional list views (for trending)
-- =========================
CREATE TABLE IF NOT EXISTS public.list_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  viewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  referrer text
);

CREATE INDEX IF NOT EXISTS list_views_list_time_idx
  ON public.list_views (list_id, viewed_at DESC);

-- =========================
-- List counters (saves/views) + timestamps
-- =========================
CREATE OR REPLACE FUNCTION public._lists_increment_save_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lists
  SET
    save_count = save_count + 1,
    last_saved_at = now()
  WHERE id = NEW.list_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._lists_decrement_save_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lists
  SET save_count = GREATEST(save_count - 1, 0)
  WHERE id = OLD.list_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public._lists_increment_view_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lists
  SET
    view_count = view_count + 1,
    last_viewed_at = now()
  WHERE id = NEW.list_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'list_saves_after_insert_metrics'
  ) THEN
    CREATE TRIGGER list_saves_after_insert_metrics
      AFTER INSERT ON public.list_saves
      FOR EACH ROW
      EXECUTE FUNCTION public._lists_increment_save_metrics();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'list_saves_after_delete_metrics'
  ) THEN
    CREATE TRIGGER list_saves_after_delete_metrics
      AFTER DELETE ON public.list_saves
      FOR EACH ROW
      EXECUTE FUNCTION public._lists_decrement_save_metrics();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'list_views_after_insert_metrics'
  ) THEN
    CREATE TRIGGER list_views_after_insert_metrics
      AFTER INSERT ON public.list_views
      FOR EACH ROW
      EXECUTE FUNCTION public._lists_increment_view_metrics();
  END IF;
END$$;

-- =========================
-- Optional updated_at triggers
-- =========================
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
  IF to_regclass('public.profiles') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'updated_at'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_set_updated_at'
    )
  THEN
    CREATE TRIGGER profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;

  IF to_regclass('public.lists') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'lists_set_updated_at'
  ) THEN
    CREATE TRIGGER lists_set_updated_at
      BEFORE UPDATE ON public.lists
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- =========================
-- RLS
-- =========================
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.list_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.list_views ENABLE ROW LEVEL SECURITY;

-- =========================
-- Policies
-- =========================
DO $$
BEGIN
  -- Profiles: owners RW policy is created in earlier migrations; add public read.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_public_read'
  ) THEN
    CREATE POLICY profiles_public_read ON public.profiles
      FOR SELECT
      TO anon, authenticated
      USING (is_public = true);
  END IF;

  -- Lists: owner RW; public/unlisted read (only if profile is public)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lists' AND policyname = 'lists_owner_rw'
  ) THEN
    CREATE POLICY lists_owner_rw ON public.lists
      FOR ALL
      USING (auth.uid() = owner_user_id)
      WITH CHECK (auth.uid() = owner_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lists' AND policyname = 'lists_public_read'
  ) THEN
    CREATE POLICY lists_public_read ON public.lists
      FOR SELECT
      TO anon, authenticated
      USING (
        visibility IN ('public', 'unlisted')
        AND EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = owner_user_id
            AND p.is_public = true
        )
      );
  END IF;

  -- List items: owner RW via list owner; public/unlisted read via list visibility + public profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_items' AND policyname = 'list_items_owner_rw'
  ) THEN
    CREATE POLICY list_items_owner_rw ON public.list_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.lists l
          WHERE l.id = list_items.list_id
            AND l.owner_user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.lists l
          WHERE l.id = list_items.list_id
            AND l.owner_user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_items' AND policyname = 'list_items_public_read'
  ) THEN
    CREATE POLICY list_items_public_read ON public.list_items
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.lists l
          JOIN public.profiles p ON p.id = l.owner_user_id
          WHERE l.id = list_items.list_id
            AND l.visibility IN ('public', 'unlisted')
            AND p.is_public = true
        )
      );
  END IF;

  -- Follows: manage own; select own pairs (for "is following?" checks)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'follows_insert_own'
  ) THEN
    CREATE POLICY follows_insert_own ON public.follows
      FOR INSERT
      TO authenticated
      WITH CHECK (follower_user_id = auth.uid() AND follower_user_id <> following_user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'follows_delete_own'
  ) THEN
    CREATE POLICY follows_delete_own ON public.follows
      FOR DELETE
      TO authenticated
      USING (follower_user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'follows' AND policyname = 'follows_select_own'
  ) THEN
    CREATE POLICY follows_select_own ON public.follows
      FOR SELECT
      TO authenticated
      USING (follower_user_id = auth.uid() OR following_user_id = auth.uid());
  END IF;

  -- List saves: saver can manage their own saves; only allow saving visible lists (or own)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_saves' AND policyname = 'list_saves_insert_own'
  ) THEN
    CREATE POLICY list_saves_insert_own ON public.list_saves
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.lists l
          WHERE l.id = list_saves.list_id
            AND (
              l.owner_user_id = auth.uid()
              OR (
                l.visibility IN ('public', 'unlisted')
                AND EXISTS (
                  SELECT 1
                  FROM public.profiles p
                  WHERE p.id = l.owner_user_id
                    AND p.is_public = true
                )
              )
            )
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_saves' AND policyname = 'list_saves_select_own'
  ) THEN
    CREATE POLICY list_saves_select_own ON public.list_saves
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_saves' AND policyname = 'list_saves_delete_own'
  ) THEN
    CREATE POLICY list_saves_delete_own ON public.list_saves
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  -- List views: allow inserts (anon + auth), keep rows private by default (no select policy)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'list_views' AND policyname = 'list_views_insert'
  ) THEN
    CREATE POLICY list_views_insert ON public.list_views
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        (viewer_user_id IS NULL OR viewer_user_id = auth.uid())
        AND EXISTS (
          SELECT 1
          FROM public.lists l
          WHERE l.id = list_views.list_id
            AND (
              l.owner_user_id = auth.uid()
              OR (
                l.visibility IN ('public', 'unlisted')
                AND EXISTS (
                  SELECT 1
                  FROM public.profiles p
                  WHERE p.id = l.owner_user_id
                    AND p.is_public = true
                )
              )
            )
        )
      );
  END IF;
END
$$;

-- =========================
-- RPC: trending lists (7d saves/views)
-- =========================
CREATE OR REPLACE FUNCTION public.get_trending_lists(
  p_section stash_section DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  owner_user_id uuid,
  section stash_section,
  title text,
  subtitle text,
  slug text,
  cover_image_url text,
  visibility list_visibility,
  is_ranked boolean,
  ranked_size integer,
  pinned_order integer,
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
      ls.list_id,
      count(*)::bigint AS saves_last_7_days
    FROM public.list_saves ls
    WHERE ls.created_at >= (now() - interval '7 days')
    GROUP BY ls.list_id
  ),
  view_counts AS (
    SELECT
      lv.list_id,
      count(*)::bigint AS views_last_7_days
    FROM public.list_views lv
    WHERE lv.viewed_at >= (now() - interval '7 days')
    GROUP BY lv.list_id
  ),
  candidate AS (
    SELECT
      l.id,
      l.owner_user_id,
      l.section,
      l.title,
      l.subtitle,
      l.slug,
      l.cover_image_url,
      l.visibility,
      l.is_ranked,
      l.ranked_size,
      l.pinned_order,
      l.save_count,
      l.view_count,
      l.created_at,
      l.updated_at,
      l.last_saved_at,
      l.last_viewed_at,
      p.handle AS owner_handle,
      p.display_name AS owner_display_name,
      p.avatar_url AS owner_avatar_url,
      COALESCE(sc.saves_last_7_days, 0) AS saves_last_7_days,
      COALESCE(vc.views_last_7_days, 0) AS views_last_7_days
    FROM public.lists l
    JOIN public.profiles p ON p.id = l.owner_user_id
    LEFT JOIN save_counts sc ON sc.list_id = l.id
    LEFT JOIN view_counts vc ON vc.list_id = l.id
    WHERE l.visibility = 'public'
      AND p.is_public = true
      AND (p_section IS NULL OR l.section = p_section)
      AND (
        NULLIF(btrim(p_search), '') IS NULL
        OR l.title ILIKE '%' || p_search || '%'
        OR COALESCE(l.subtitle, '') ILIKE '%' || p_search || '%'
        OR p.handle ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    c.id,
    c.owner_user_id,
    c.section,
    c.title,
    c.subtitle,
    c.slug,
    c.cover_image_url,
    c.visibility,
    c.is_ranked,
    c.ranked_size,
    c.pinned_order,
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

GRANT EXECUTE ON FUNCTION public.get_trending_lists(stash_section, text, integer, integer) TO anon, authenticated;

-- =========================
-- RPC: reorder list items (atomic)
-- =========================
CREATE OR REPLACE FUNCTION public.reorder_list_items(list_id uuid, item_ids uuid[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_input_count integer;
  v_unique_count integer;
  v_total_count integer;
  v_shift integer;
  v_is_ranked boolean;
  v_ranked_size integer;
BEGIN
  IF list_id IS NULL THEN
    RAISE EXCEPTION 'list_id is required';
  END IF;

  v_input_count := COALESCE(cardinality(item_ids), 0);
  IF v_input_count = 0 THEN
    RAISE EXCEPTION 'item_ids must be a non-empty array';
  END IF;

  SELECT l.is_ranked, l.ranked_size
  INTO v_is_ranked, v_ranked_size
  FROM public.lists l
  WHERE l.id = reorder_list_items.list_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'list not found';
  END IF;

  SELECT count(*)
  INTO v_unique_count
  FROM (
    SELECT DISTINCT id
    FROM unnest(item_ids) AS u(id)
  ) deduped;

  IF v_unique_count <> v_input_count THEN
    RAISE EXCEPTION 'item_ids contains duplicate ids';
  END IF;

  SELECT count(*)
  INTO v_total_count
  FROM public.list_items li
  WHERE li.list_id = reorder_list_items.list_id;

  IF v_total_count <> v_input_count THEN
    RAISE EXCEPTION 'item_ids must include every item in the list';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(item_ids) AS u(id)
    LEFT JOIN public.list_items li
      ON li.id = u.id
     AND li.list_id = reorder_list_items.list_id
    WHERE li.id IS NULL
  ) THEN
    RAISE EXCEPTION 'item_ids contains ids that are not in this list';
  END IF;

  IF v_is_ranked AND v_ranked_size IS NOT NULL AND v_input_count > v_ranked_size THEN
    RAISE EXCEPTION 'ranked list cannot exceed % items', v_ranked_size;
  END IF;

  SELECT COALESCE(max(li.rank_index), 0) + v_input_count + 32
  INTO v_shift
  FROM public.list_items li
  WHERE li.list_id = reorder_list_items.list_id;

  PERFORM set_config('stash.reorder_context', '1', true);

  -- Pass 1: move into a temporary rank range to avoid unique collisions.
  WITH ord AS (
    SELECT id, ordinality::integer AS ord
    FROM unnest(item_ids) WITH ORDINALITY AS u(id, ordinality)
  )
  UPDATE public.list_items li
  SET rank_index = ord.ord + v_shift
  FROM ord
  WHERE li.id = ord.id
    AND li.list_id = reorder_list_items.list_id;

  -- Pass 2: apply final contiguous ranks.
  WITH ord AS (
    SELECT id, ordinality::integer AS ord
    FROM unnest(item_ids) WITH ORDINALITY AS u(id, ordinality)
  )
  UPDATE public.list_items li
  SET rank_index = ord.ord
  FROM ord
  WHERE li.id = ord.id
    AND li.list_id = reorder_list_items.list_id;

  PERFORM set_config('stash.reorder_context', '0', true);
END;
$$;
