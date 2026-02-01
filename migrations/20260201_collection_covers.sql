-- Collection cover images for trips

alter table if exists public.trips
  add column if not exists cover_image_url text null,
  add column if not exists cover_image_source text null,
  add column if not exists cover_updated_at timestamptz null;
