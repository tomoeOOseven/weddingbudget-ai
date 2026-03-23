-- Add typed wedding wizard state table and tighten client-data access

create table if not exists public.wedding_wizard_state (
  wedding_id               uuid primary key references public.weddings(id) on delete cascade,
  step                     integer not null default 1 check (step between 1 and 7),
  city_slug                text,
  hotel_tier_slug          text,
  rooms_blocked            integer,
  total_guests             integer,
  outstation_pct           numeric(5,2),
  function_ids             text[] not null default '{}',
  selected_decor_ids       uuid[] not null default '{}',
  selected_artist_ids      uuid[] not null default '{}',
  selected_meal_ids        text[] not null default '{}',
  bar_tier_slug            text,
  specialty_counter_ids    text[] not null default '{}',
  transfers                boolean,
  ghodi                    boolean,
  dholis                   integer,
  sfx_ids                  text[] not null default '{}',
  room_baskets             boolean,
  rituals                  boolean,
  gifts                    boolean,
  stationery               boolean,
  photography              boolean,
  updated_at               timestamptz not null default now()
);

alter table public.wedding_wizard_state enable row level security;

drop policy if exists "weddings: admin reads all" on public.weddings;

drop policy if exists "wedding_functions_admin_read" on public.wedding_functions;
drop policy if exists "decor_selections_admin_read" on public.decor_selections;
drop policy if exists "artist_bookings_admin_read" on public.artist_bookings;
drop policy if exists "fb_selections_admin_read" on public.fb_selections;
drop policy if exists "logistics_selections_admin_read" on public.logistics_selections;
drop policy if exists "budget_estimates_admin_read" on public.budget_estimates;
drop policy if exists "budget_actuals_admin_read" on public.budget_actuals;
drop policy if exists "scenarios_admin_read" on public.scenarios;

create policy "wedding_wizard_state: client owns via wedding"
  on public.wedding_wizard_state for all
  using (public.owns_wedding(wedding_id));
