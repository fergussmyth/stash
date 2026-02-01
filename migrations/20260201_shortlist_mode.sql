-- Shortlist mode fields for trip_items

alter table if exists public.trip_items
  add column if not exists shortlisted boolean not null default false,
  add column if not exists dismissed boolean not null default false;

create index if not exists trip_items_shortlisted_idx
  on public.trip_items(trip_id, shortlisted)
  where shortlisted = true;

create index if not exists trip_items_dismissed_idx
  on public.trip_items(trip_id, dismissed)
  where dismissed = true;
