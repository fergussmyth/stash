-- Analytics events table for quiet tracking

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_user_time_idx
  on public.analytics_events(user_id, created_at desc);

alter table public.analytics_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'analytics_events' and policyname = 'insert own events'
  ) then
    create policy "insert own events" on public.analytics_events
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end
$$;
