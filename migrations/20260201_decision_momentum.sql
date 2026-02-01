-- Decision momentum tracking fields for trip_items

alter table if exists public.trip_items
  add column if not exists open_count integer not null default 0,
  add column if not exists last_opened_at timestamptz,
  add column if not exists decision_group_id uuid,
  add column if not exists chosen boolean not null default false,
  add column if not exists primary_action text,
  add column if not exists domain text;

create index if not exists trip_items_trip_domain_idx
  on public.trip_items(trip_id, domain);

create index if not exists trip_items_decision_group_idx
  on public.trip_items(decision_group_id);

create index if not exists trip_items_last_opened_idx
  on public.trip_items(last_opened_at desc);

create index if not exists trip_items_domain_idx
  on public.trip_items(domain);

update public.trip_items
set domain = regexp_replace(regexp_replace(url, '^https?://', ''), '/.*$', '')
where domain is null and url is not null;
