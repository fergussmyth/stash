-- Incremental model update: collections + saved links metadata

-- Profiles table
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trips -> Collections extensions
alter table if exists trips
  add column if not exists type text not null default 'travel',
  add column if not exists pinned boolean not null default false,
  add column if not exists icon text null,
  add column if not exists color text null;

-- Trip items -> Saved links extensions
alter table if exists trip_items
  add column if not exists original_url text null,
  add column if not exists domain text null,
  add column if not exists platform text null,
  add column if not exists item_type text not null default 'link',
  add column if not exists image_url text null,
  add column if not exists favicon_url text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists pinned boolean not null default false,
  add column if not exists archived boolean not null default false;

-- Backfill
update trip_items
set original_url = url
where original_url is null
  and url is not null;

update trip_items
set domain = lower(regexp_replace(url, '^https?://(www\\.)?([^/]+).*$' , '\\2'))
where domain is null
  and url ~* '^https?://';

update trip_items
set platform = 'airbnb'
where platform is null
  and (domain ilike '%airbnb.%' or url ilike '%airbnb.%');

-- RLS policies (create if missing)
alter table if exists profiles enable row level security;
alter table if exists trips enable row level security;
alter table if exists trip_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_owner_rw'
  ) then
    create policy profiles_owner_rw on profiles
      for all using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trips' and policyname = 'trips_owner_rw'
  ) then
    create policy trips_owner_rw on trips
      for all using (auth.uid() = owner_id)
      with check (auth.uid() = owner_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_items' and policyname = 'trip_items_owner_rw'
  ) then
    create policy trip_items_owner_rw on trip_items
      for all
      using (
        exists (
          select 1
          from trips t
          where t.id = trip_items.trip_id
            and t.owner_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from trips t
          where t.id = trip_items.trip_id
            and t.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trips' and policyname = 'trips_shared_read'
  ) then
    create policy trips_shared_read on trips
      for select using (is_shared = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trip_items' and policyname = 'trip_items_shared_read'
  ) then
    create policy trip_items_shared_read on trip_items
      for select using (
        exists (
          select 1 from trips t where t.id = trip_items.trip_id and t.is_shared = true
        )
      );
  end if;
end
$$;

-- Chrome extension personal access tokens
create table if not exists public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Chrome Extension',
  token_hash text not null,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists extension_tokens_user_id_idx
  on public.extension_tokens(user_id);

create unique index if not exists extension_tokens_hash_unique
  on public.extension_tokens(token_hash);

alter table if exists public.extension_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'extension_tokens' and policyname = 'select_own_tokens'
  ) then
    create policy select_own_tokens on public.extension_tokens
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'extension_tokens' and policyname = 'insert_own_tokens'
  ) then
    create policy insert_own_tokens on public.extension_tokens
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'extension_tokens' and policyname = 'delete_own_tokens'
  ) then
    create policy delete_own_tokens on public.extension_tokens
      for delete
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'extension_tokens' and policyname = 'update_own_tokens'
  ) then
    create policy update_own_tokens on public.extension_tokens
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end
$$;

-- Trip items normalized url for per-collection dedupe
alter table if exists public.trip_items
  add column if not exists normalized_url text;

create unique index if not exists trip_items_trip_normalized_unique
  on public.trip_items(trip_id, normalized_url);
