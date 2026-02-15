-- Hotfix: ranked list reorder for Stash v3
-- Run this in Supabase SQL editor if ranked item reordering reverts.

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
  -- Allow temporary out-of-range ranks only during internal reorder pass.
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

  -- Pass 1: move to temporary ranks to avoid unique collisions.
  WITH ord AS (
    SELECT id, ordinality::integer AS ord
    FROM unnest(item_ids) WITH ORDINALITY AS u(id, ordinality)
  )
  UPDATE public.list_items li
  SET rank_index = ord.ord + v_shift
  FROM ord
  WHERE li.id = ord.id
    AND li.list_id = reorder_list_items.list_id;

  -- Pass 2: write final contiguous order.
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

GRANT EXECUTE ON FUNCTION public.reorder_list_items(uuid, uuid[]) TO anon, authenticated;
