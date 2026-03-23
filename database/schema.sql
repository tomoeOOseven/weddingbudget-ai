-- ============================================================
-- WeddingBudget.ai — Full Supabase Database Schema
-- ============================================================
-- Sections:
--   0. Extensions
--   1. Enums
--   2. User Profiles & Roles
--   3. Reference / Cost Data (admin-editable, version-controlled)
--   4. Audit Log System
--   5. Scraping Pipeline
--   6. Image Labelling & Dataset
--   7. ML Model Versioning
--   8. Client Data (weddings, budgets, actuals)
--   9. Row Level Security Policies
--  10. Seed Data
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================

-- pgvector: store CLIP image embeddings directly in Postgres
-- (enables cosine similarity search for "find similar decor" feature)
create extension if not exists vector;

-- pg_cron: schedule scraper runs from inside Supabase (optional, enable in dashboard)
-- create extension if not exists pg_cron;

-- uuid generation
create extension if not exists "uuid-ossp";


-- ============================================================
-- 1. ENUMS
-- ============================================================

create type user_role as enum ('client', 'admin', 'super_admin');

create type wedding_function as enum (
  'haldi', 'mehendi', 'sangeet', 'baraat', 'pheras', 'reception', 'other'
);

create type decor_style as enum (
  'Traditional', 'Boho', 'Modern', 'Contemporary', 'Romantic', 'Opulent', 'Rustic', 'Vintage'
);

create type complexity_tier as enum ('low', 'medium', 'high', 'ultra');

create type hotel_tier as enum ('palace', 'city5', 'star4', 'resort', 'farm');

create type bar_type as enum ('dry', 'wine', 'full');

create type artist_type as enum (
  'DJ', 'Band', 'Singer', 'Folk', 'Anchor', 'Choreo', 'Myra', 'Other'
);

create type scrape_status as enum ('pending', 'running', 'completed', 'failed', 'skipped');

create type label_source as enum ('manual', 'ai_suggested', 'ai_confirmed');

create type image_status as enum ('raw', 'labelled', 'rejected', 'embedded');

create type model_status as enum ('training', 'ready', 'deprecated', 'failed');

create type budget_status as enum ('draft', 'finalised', 'shared', 'archived');


-- ============================================================
-- 2. USER PROFILES & ROLES
-- ============================================================

-- Extends Supabase auth.users. Created automatically on signup via trigger.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  role            user_role not null default 'client',
  full_name       text,
  email           text,                            -- denormalised for easy querying
  phone           text,
  organisation    text,                            -- admin: "Events by Athea"; client: their name
  avatar_url      text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'One profile per auth user. role column drives all RLS policies.';

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: get current user's role (used in RLS policies)
create or replace function public.current_user_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select role in ('admin', 'super_admin')
  from public.profiles where id = auth.uid();
$$;


-- ============================================================
-- 3. REFERENCE / COST DATA  (admin-editable)
-- ============================================================
-- All cost tables follow the same pattern:
--   • slug / id: stable identifier used in code
--   • is_active: soft delete
--   • updated_by: FK to profiles (admin who last edited)
--   • version: integer incremented on every update (via trigger)
-- Audit history lives in the audit_log table (Section 4).

-- 3a. Cities
create table public.cities (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,              -- 'mumbai', 'udaipur' etc.
  label         text not null,
  region        text not null,
  multiplier    numeric(4,2) not null default 1.0, -- base cost multiplier vs Hyderabad
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on column public.cities.multiplier is
  'All cost estimates are multiplied by this. Hyderabad = 1.0 baseline.';

-- 3b. Hotel Tiers
create table public.hotel_tiers (
  id            uuid primary key default uuid_generate_v4(),
  slug          hotel_tier not null unique,
  label         text not null,
  room_rate     integer not null,                  -- INR per night (baseline city)
  cost_mult     numeric(4,2) not null default 1.0, -- overall cost multiplier
  decor_mult    numeric(4,2) not null default 1.0, -- decor-specific multiplier
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3c. Artists
create table public.artists (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  label         text not null,                     -- e.g. "Bollywood Singer – Tier A"
  artist_type   artist_type not null,
  is_named      boolean not null default false,    -- true = specific artist, false = generic tier
  cost_min      integer not null,                  -- INR
  cost_max      integer not null,
  notes         text,
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3d. Meals (F&B per-head costs)
create table public.meals (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  label         text not null,
  cost_min_ph   integer not null,                  -- per head INR
  cost_max_ph   integer not null,
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3e. Bar Tiers
create table public.bar_tiers (
  id            uuid primary key default uuid_generate_v4(),
  slug          bar_type not null unique,
  label         text not null,
  cost_min_ph   integer not null default 0,        -- per head INR
  cost_max_ph   integer not null default 0,
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3f. Specialty Counters (F&B add-ons)
create table public.specialty_counters (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  label         text not null,
  cost_min      integer not null,
  cost_max      integer not null,
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3g. Logistics Rates
create table public.logistics_rates (
  id                    uuid primary key default uuid_generate_v4(),
  guests_per_vehicle    integer not null default 3,
  vehicle_rate_min      integer not null default 4500,
  vehicle_rate_max      integer not null default 7000,
  ghodi_min             integer not null default 45000,
  ghodi_max             integer not null default 90000,
  dholi_unit_min        integer not null default 15000,
  dholi_unit_max        integer not null default 30000,
  is_active             boolean not null default true,
  version               integer not null default 1,
  updated_by            uuid references public.profiles(id),
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

comment on table public.logistics_rates is
  'Single-row config table. Always query where is_active = true order by version desc limit 1.';

-- 3h. SFX Items
create table public.sfx_items (
  id            uuid primary key default uuid_generate_v4(),
  slug          text not null unique,
  label         text not null,
  cost_fixed    integer not null,                  -- fixed unit cost
  unit          text not null default 'unit',      -- 'per stage', 'set', etc.
  is_active     boolean not null default true,
  version       integer not null default 1,
  updated_by    uuid references public.profiles(id),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- 3i. Sundries Config
create table public.sundries_config (
  id                        uuid primary key default uuid_generate_v4(),
  room_basket_min           integer not null default 1800,
  room_basket_max           integer not null default 3500,
  ritual_per_fn_min         integer not null default 35000,
  ritual_per_fn_max         integer not null default 75000,
  gift_per_guest_min        integer not null default 500,
  gift_per_guest_max        integer not null default 1500,
  stationery_per_guest_min  integer not null default 200,
  stationery_per_guest_max  integer not null default 500,
  photography_min           integer not null default 180000,
  photography_max           integer not null default 550000,
  contingency_pct           numeric(4,3) not null default 0.05,
  is_active                 boolean not null default true,
  version                   integer not null default 1,
  updated_by                uuid references public.profiles(id),
  updated_at                timestamptz not null default now(),
  created_at                timestamptz not null default now()
);

comment on table public.sundries_config is
  'Single-row config table. Same query pattern as logistics_rates.';

-- 3j. Seed Decor Items (admin-curated, separate from scraped library)
--    These are the hand-verified reference designs used as anchors for ML training.
create table public.decor_items (
  id              uuid primary key default uuid_generate_v4(),
  slug            text not null unique,
  label           text not null,
  function_type   wedding_function not null,
  style           decor_style not null,
  complexity      complexity_tier not null default 'medium',
  cost_min        integer not null,
  cost_max        integer not null,
  image_url       text,                            -- Supabase Storage path
  source_url      text,                            -- original reference URL
  is_active       boolean not null default true,
  version         integer not null default 1,
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);


-- ============================================================
-- 4. AUDIT LOG SYSTEM
-- ============================================================
-- Every INSERT, UPDATE on cost tables writes a row here.
-- Provides full history + rollback capability.

create table public.audit_log (
  id            uuid primary key default uuid_generate_v4(),
  table_name    text not null,
  record_id     uuid not null,
  operation     text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data      jsonb,                             -- null for INSERT
  new_data      jsonb,                             -- null for DELETE
  changed_by    uuid references public.profiles(id),
  changed_at    timestamptz not null default now(),
  change_note   text                               -- optional admin comment
);

create index idx_audit_log_table_record on public.audit_log (table_name, record_id);
create index idx_audit_log_changed_at   on public.audit_log (changed_at desc);

comment on table public.audit_log is
  'Append-only audit trail. Never update or delete rows here.';

-- Generic audit trigger function (attach to any cost table)
create or replace function public.audit_trigger_fn()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
  values (
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    TG_OP,
    case when TG_OP = 'INSERT' then null else to_jsonb(old) end,
    case when TG_OP = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );

  -- Increment version on update
  if TG_OP = 'UPDATE' then
    new.version := old.version + 1;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

-- Apply audit trigger to all cost tables
create trigger audit_cities
  before insert or update on public.cities
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_hotel_tiers
  before insert or update on public.hotel_tiers
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_artists
  before insert or update on public.artists
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_meals
  before insert or update on public.meals
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_bar_tiers
  before insert or update on public.bar_tiers
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_specialty_counters
  before insert or update on public.specialty_counters
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_logistics_rates
  before insert or update on public.logistics_rates
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_sfx_items
  before insert or update on public.sfx_items
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_sundries_config
  before insert or update on public.sundries_config
  for each row execute procedure public.audit_trigger_fn();

create trigger audit_decor_items
  before insert or update on public.decor_items
  for each row execute procedure public.audit_trigger_fn();


-- ============================================================
-- 5. SCRAPING PIPELINE
-- ============================================================

-- 5a. Scrape Sources (the 20-25 tracked sites)
create table public.scrape_sources (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,                 -- "WedMeGood", "Meragi", etc.
  base_url          text not null unique,
  scraper_type      text not null default 'playwright', -- 'playwright' | 'cheerio'
  url_patterns      jsonb not null default '[]',   -- list of URL templates to crawl
  selectors         jsonb not null default '{}',   -- CSS/XPath selectors config per site
  rate_limit_ms     integer not null default 2000, -- delay between requests
  is_active         boolean not null default true,
  last_scraped_at   timestamptz,
  scrape_interval   text not null default '7 days', -- cron-style or interval
  notes             text,
  added_by          uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.scrape_sources.selectors is
  'Per-site CSS/XPath config: { imageSelector, titleSelector, descriptionSelector, priceSelector }';

-- 5b. Scrape Jobs (one row per run of one source)
create table public.scrape_jobs (
  id                uuid primary key default uuid_generate_v4(),
  source_id         uuid not null references public.scrape_sources(id),
  status            scrape_status not null default 'pending',
  triggered_by      uuid references public.profiles(id),  -- null = cron
  started_at        timestamptz,
  completed_at      timestamptz,
  images_found      integer not null default 0,
  images_saved      integer not null default 0,
  images_duped      integer not null default 0,           -- skipped duplicates
  error_message     text,
  log               jsonb not null default '[]',          -- array of log lines
  created_at        timestamptz not null default now()
);

create index idx_scrape_jobs_source    on public.scrape_jobs (source_id, created_at desc);
create index idx_scrape_jobs_status    on public.scrape_jobs (status);

-- 5c. Scraped Images (raw, untagged images)
create table public.scraped_images (
  id                uuid primary key default uuid_generate_v4(),
  job_id            uuid references public.scrape_jobs(id),
  source_id         uuid not null references public.scrape_sources(id),
  source_url        text not null,                        -- original page URL
  image_url         text not null,                        -- original image URL
  storage_path      text,                                 -- Supabase Storage path after download
  title             text,                                 -- scraped title/alt text
  description       text,                                 -- scraped description
  scraped_tags      jsonb not null default '[]',          -- any tags found on the source site
  price_text        text,                                 -- scraped price string from source page
  price_inr         integer,                              -- parsed integer INR value when available
  image_hash        text,                                 -- perceptual hash for dedup
  width_px          integer,
  height_px         integer,
  file_size_bytes   integer,
  status            image_status not null default 'raw',
  created_at        timestamptz not null default now()
);

create unique index idx_scraped_images_hash   on public.scraped_images (image_hash)
  where image_hash is not null;
create index idx_scraped_images_status        on public.scraped_images (status);
create index idx_scraped_images_source        on public.scraped_images (source_id);

comment on column public.scraped_images.image_hash is
  'Perceptual hash (pHash) used to deduplicate near-identical images across sources.';


-- ============================================================
-- 6. IMAGE LABELLING & DATASET
-- ============================================================

-- 6a. Image Labels (the dataset for model training)
--     One row per image. Can be created manually or via AI suggestion.
create table public.image_labels (
  id                uuid primary key default uuid_generate_v4(),
  image_id          uuid not null unique references public.scraped_images(id) on delete cascade,
  function_type     wedding_function,
  style             decor_style,
  complexity        complexity_tier,
  cost_seed_min     integer,                               -- admin-seeded cost (INR)
  cost_seed_max     integer,
  label_source      label_source not null default 'manual',
  confidence        numeric(3,2),                         -- 0.0–1.0; AI fills this
  labelled_by       uuid references public.profiles(id),  -- admin who confirmed
  labelled_at       timestamptz not null default now(),
  notes             text,
  is_in_training    boolean not null default false,       -- included in active training set
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_image_labels_function   on public.image_labels (function_type);
create index idx_image_labels_style      on public.image_labels (style);
create index idx_image_labels_training   on public.image_labels (is_in_training);

comment on column public.image_labels.is_in_training is
  'Admin toggles this to curate the training set. Not all labelled images may be included.';

-- 6b. AI Label Suggestions (staging area before admin confirms)
--     When admin clicks "AI Auto-Tag", result lands here first.
create table public.ai_label_suggestions (
  id                uuid primary key default uuid_generate_v4(),
  image_id          uuid not null references public.scraped_images(id) on delete cascade,
  model_used        text not null,                        -- e.g. "claude-sonnet-4-20250514"
  raw_response      jsonb not null,                       -- full API response
  suggested_function  wedding_function,
  suggested_style     decor_style,
  suggested_complexity complexity_tier,
  suggested_cost_min  integer,
  suggested_cost_max  integer,
  confidence          numeric(3,2),
  reasoning           text,                              -- AI explanation
  status            text not null default 'pending'
                    check (status in ('pending', 'accepted', 'edited', 'rejected')),
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  tokens_used       integer,
  cost_usd          numeric(8,6),                        -- OpenRouter cost tracking
  created_at        timestamptz not null default now()
);

create index idx_ai_suggestions_image    on public.ai_label_suggestions (image_id);
create index idx_ai_suggestions_status   on public.ai_label_suggestions (status);

comment on table public.ai_label_suggestions is
  'AI auto-tag results pending admin review. On accept/edit, a row is upserted into image_labels.';

-- 6c. Image Embeddings (CLIP vectors for similarity search & ML training)
create table public.image_embeddings (
  id                uuid primary key default uuid_generate_v4(),
  image_id          uuid not null unique references public.scraped_images(id) on delete cascade,
  embedding         vector(512),                          -- CLIP ViT-B/32 = 512 dims
  model_name        text not null default 'clip-vit-b32',
  created_at        timestamptz not null default now()
);

-- IVFFlat index for approximate nearest neighbour search
-- Run after inserting >1000 rows: CREATE INDEX ... (adjust lists=100 for your data size)
-- create index idx_image_embeddings_ivfflat
--   on public.image_embeddings using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

comment on column public.image_embeddings.embedding is
  'CLIP ViT-B/32 embedding (512 dims). Generated by Python ML service after image download.';


-- ============================================================
-- 7. ML MODEL VERSIONING
-- ============================================================

-- 7a. Model Versions (one row per trained model)
create table public.model_versions (
  id                  uuid primary key default uuid_generate_v4(),
  version_label       text not null unique,              -- e.g. "v1.0", "v2.3"
  status              model_status not null default 'training',
  training_set_size   integer,                           -- number of labelled images used
  algorithm           text not null default 'GBM',       -- 'GBM', 'RandomForest', 'XGBoost'
  feature_cols        jsonb not null default '[]',       -- list of features used
  -- Accuracy metrics
  mae_min             numeric(10,2),                     -- Mean Absolute Error on cost_min
  mae_max             numeric(10,2),
  r2_min              numeric(5,4),                      -- R² score
  r2_max              numeric(5,4),
  test_set_size       integer,
  -- Storage
  model_file_path     text,                              -- Supabase Storage path for .pkl/.joblib
  trained_at          timestamptz,
  trained_by          uuid references public.profiles(id),
  is_active           boolean not null default false,    -- only ONE model active at a time
  notes               text,
  created_at          timestamptz not null default now()
);

create index idx_model_versions_active on public.model_versions (is_active, trained_at desc);

comment on column public.model_versions.is_active is
  'Exactly one row should have is_active=true. The ML inference endpoint uses that model.';

-- 7b. Training Runs (detailed log of each retrain)
create table public.training_runs (
  id                  uuid primary key default uuid_generate_v4(),
  model_version_id    uuid not null references public.model_versions(id),
  triggered_by        uuid references public.profiles(id),
  config              jsonb not null default '{}',       -- hyperparameters used
  log                 jsonb not null default '[]',       -- stdout/stderr lines
  duration_seconds    integer,
  status              text not null default 'running'
                      check (status in ('running', 'completed', 'failed')),
  error_message       text,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz
);

-- 7c. Inference Log (every time ML model is queried for a client)
create table public.inference_log (
  id                  uuid primary key default uuid_generate_v4(),
  model_version_id    uuid not null references public.model_versions(id),
  image_id            uuid references public.scraped_images(id),
  decor_item_id       uuid references public.decor_items(id),   -- if querying seed item
  input_features      jsonb not null,                           -- city, hotel tier, style etc.
  predicted_min       integer,
  predicted_max       integer,
  confidence          numeric(3,2),
  latency_ms          integer,
  created_at          timestamptz not null default now()
);

create index idx_inference_log_model on public.inference_log (model_version_id, created_at desc);


-- ============================================================
-- 8. CLIENT DATA
-- ============================================================

-- 8a. Weddings (a client's wedding project)
create table public.weddings (
  id                  uuid primary key default uuid_generate_v4(),
  client_id           uuid not null references public.profiles(id) on delete cascade,
  name                text not null,                     -- e.g. "Priya & Arjun Wedding"
  wedding_date        date,
  city_id             uuid references public.cities(id),
  hotel_tier_id       uuid references public.hotel_tiers(id),
  rooms_blocked       integer,
  total_guests        integer,
  outstation_pct      numeric(5,2) default 0,            -- % of guests travelling in
  bride_hometown      text,
  groom_hometown      text,
  status              budget_status not null default 'draft',
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_weddings_client on public.weddings (client_id);

-- 8b. Wedding Functions (events within a wedding)
create table public.wedding_functions (
  id                  uuid primary key default uuid_generate_v4(),
  wedding_id          uuid not null references public.weddings(id) on delete cascade,
  function_type       wedding_function not null,
  label               text,                              -- custom name override
  function_date       date,
  guest_count         integer,
  venue_note          text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

create index idx_wedding_functions_wedding on public.wedding_functions (wedding_id);

-- 8c. Decor Selections (client shortlists per function)
create table public.decor_selections (
  id                  uuid primary key default uuid_generate_v4(),
  function_id         uuid not null references public.wedding_functions(id) on delete cascade,
  -- Either a seed decor item OR a scraped image, not both
  decor_item_id       uuid references public.decor_items(id),
  scraped_image_id    uuid references public.scraped_images(id),
  style_override      decor_style,
  complexity_override complexity_tier,
  -- ML prediction result (snapshot at time of selection)
  predicted_min       integer,
  predicted_max       integer,
  model_version_id    uuid references public.model_versions(id),
  confidence          numeric(3,2),
  notes               text,
  is_primary          boolean not null default false,    -- client's top pick for this function
  created_at          timestamptz not null default now(),
  constraint chk_decor_source check (
    (decor_item_id is not null) != (scraped_image_id is not null)
    -- exactly one must be set
    or (decor_item_id is not null and scraped_image_id is null)
    or (decor_item_id is null and scraped_image_id is not null)
  )
);

create index idx_decor_selections_function on public.decor_selections (function_id);

-- 8d. Artist Bookings (per wedding, not per function — artists span events)
create table public.artist_bookings (
  id                  uuid primary key default uuid_generate_v4(),
  wedding_id          uuid not null references public.weddings(id) on delete cascade,
  artist_id           uuid not null references public.artists(id),
  function_id         uuid references public.wedding_functions(id),
  quoted_min          integer,                           -- actual quoted cost (may differ from master)
  quoted_max          integer,
  notes               text,
  created_at          timestamptz not null default now()
);

-- 8e. F&B Selections (per function)
create table public.fb_selections (
  id                  uuid primary key default uuid_generate_v4(),
  function_id         uuid not null references public.wedding_functions(id) on delete cascade,
  meal_ids            jsonb not null default '[]',       -- array of meal UUIDs selected
  bar_tier_id         uuid references public.bar_tiers(id),
  specialty_counter_ids jsonb not null default '[]',     -- array of counter UUIDs
  guest_count_override integer,                          -- if different from function default
  created_at          timestamptz not null default now()
);

-- 8f. Logistics Selections (per wedding)
create table public.logistics_selections (
  id                      uuid primary key default uuid_generate_v4(),
  wedding_id              uuid not null unique references public.weddings(id) on delete cascade,
  needs_airport_transfers boolean not null default false,
  needs_station_transfers boolean not null default false,
  outstation_guest_count  integer not null default 0,
  ghodi_count             integer not null default 1,
  dholi_count             integer not null default 2,
  dholi_hours             integer not null default 3,
  sfx_selections          jsonb not null default '[]',   -- array of { sfx_item_id, quantity }
  custom_notes            text,
  created_at              timestamptz not null default now()
);

-- 8g. Budget Estimates (computed, stored snapshot)
create table public.budget_estimates (
  id                    uuid primary key default uuid_generate_v4(),
  wedding_id            uuid not null references public.weddings(id) on delete cascade,
  version               integer not null default 1,
  -- Totals (INR)
  decor_min             integer,
  decor_max             integer,
  fb_min                integer,
  fb_max                integer,
  artist_min            integer,
  artist_max            integer,
  logistics_min         integer,
  logistics_max         integer,
  venue_min             integer,
  venue_max             integer,
  sundries_min          integer,
  sundries_max          integer,
  total_min             integer,
  total_max             integer,
  total_mid             integer,
  contingency_amt       integer,
  -- Metadata
  ai_confidence         numeric(3,2),
  model_version_id      uuid references public.model_versions(id),
  line_items            jsonb not null default '[]',     -- full itemised breakdown
  generated_at          timestamptz not null default now(),
  generated_by          uuid references public.profiles(id),
  is_current            boolean not null default true,   -- only latest estimate is current
  export_pdf_path       text,                            -- Supabase Storage path
  export_xlsx_path      text,
  notes                 text
);

create index idx_budget_estimates_wedding on public.budget_estimates (wedding_id, generated_at desc);

-- 8h. Budget Actuals (post-booking tracker — actuals vs estimates)
create table public.budget_actuals (
  id                    uuid primary key default uuid_generate_v4(),
  wedding_id            uuid not null references public.weddings(id) on delete cascade,
  estimate_id           uuid references public.budget_estimates(id),
  cost_head             text not null,                   -- 'decor', 'fb', 'artist', etc.
  line_item_label       text not null,
  estimated_min         integer,
  estimated_max         integer,
  actual_amount         integer,
  vendor_name           text,
  invoice_reference     text,
  paid_date             date,
  notes                 text,
  logged_by             uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_budget_actuals_wedding on public.budget_actuals (wedding_id);

-- 8i. Scenarios (side-by-side comparisons)
create table public.scenarios (
  id                    uuid primary key default uuid_generate_v4(),
  wedding_id            uuid not null references public.weddings(id) on delete cascade,
  label                 text not null,                   -- e.g. "Palace Option"
  city_id               uuid references public.cities(id),
  hotel_tier_id         uuid references public.hotel_tiers(id),
  estimate_id           uuid references public.budget_estimates(id),
  is_baseline           boolean not null default false,  -- one scenario is the base comparison
  notes                 text,
  created_at            timestamptz not null default now()
);

create index idx_scenarios_wedding on public.scenarios (wedding_id);

-- 8j. Wedding Wizard State (secure persisted customize state, no JSON blobs)
create table public.wedding_wizard_state (
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


-- ============================================================
-- 9. ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Enable RLS on every table
alter table public.profiles               enable row level security;
alter table public.cities                 enable row level security;
alter table public.hotel_tiers            enable row level security;
alter table public.artists                enable row level security;
alter table public.meals                  enable row level security;
alter table public.bar_tiers              enable row level security;
alter table public.specialty_counters     enable row level security;
alter table public.logistics_rates        enable row level security;
alter table public.sfx_items              enable row level security;
alter table public.sundries_config        enable row level security;
alter table public.decor_items            enable row level security;
alter table public.audit_log              enable row level security;
alter table public.scrape_sources         enable row level security;
alter table public.scrape_jobs            enable row level security;
alter table public.scraped_images         enable row level security;
alter table public.image_labels           enable row level security;
alter table public.ai_label_suggestions   enable row level security;
alter table public.image_embeddings       enable row level security;
alter table public.model_versions         enable row level security;
alter table public.training_runs          enable row level security;
alter table public.inference_log          enable row level security;
alter table public.weddings               enable row level security;
alter table public.wedding_functions      enable row level security;
alter table public.decor_selections       enable row level security;
alter table public.artist_bookings        enable row level security;
alter table public.fb_selections          enable row level security;
alter table public.logistics_selections   enable row level security;
alter table public.budget_estimates       enable row level security;
alter table public.budget_actuals         enable row level security;
alter table public.scenarios              enable row level security;
alter table public.wedding_wizard_state   enable row level security;

-- ── Profiles ──────────────────────────────────────────────────
create policy "profiles: own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: admin reads all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: own update"
  on public.profiles for update
  using (id = auth.uid());

-- ── Reference tables: public read, admin write ─────────────────
-- (cities, hotel_tiers, artists, meals, bar_tiers, specialty_counters,
--  logistics_rates, sfx_items, sundries_config, decor_items)

do $$ declare t text;
begin
  foreach t in array array[
    'cities','hotel_tiers','artists','meals','bar_tiers',
    'specialty_counters','logistics_rates','sfx_items','sundries_config','decor_items'
  ] loop
    execute format('
      create policy %I on public.%I for select using (true);
      create policy %I on public.%I for insert with check (public.is_admin());
      create policy %I on public.%I for update using (public.is_admin());
      create policy %I on public.%I for delete using (public.is_admin());
    ',
      t||'_read', t,
      t||'_insert', t,
      t||'_update', t,
      t||'_delete', t
    );
  end loop;
end $$;

-- ── Audit log: admin read-only, no deletes ever ────────────────
create policy "audit_log: admin read"
  on public.audit_log for select
  using (public.is_admin());

-- ── Scraping tables: admin only ────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array[
    'scrape_sources','scrape_jobs','scraped_images',
    'image_labels','ai_label_suggestions','image_embeddings',
    'model_versions','training_runs','inference_log'
  ] loop
    execute format('
      create policy %I on public.%I for all using (public.is_admin());
    ', t||'_admin_all', t);
  end loop;
end $$;

-- scraped_images: clients can read labelled images (for the decor library browser)
create policy "scraped_images: client reads labelled"
  on public.scraped_images for select
  using (status = 'labelled');

-- ── Client data: clients own their rows ───────────────────────
create policy "weddings: client owns"
  on public.weddings for all
  using (client_id = auth.uid());

-- Helper: is this wedding_id owned by the current client?
create or replace function public.owns_wedding(wid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.weddings
    where id = wid and client_id = auth.uid()
  );
$$;

create policy "wedding_functions: client owns via wedding"
  on public.wedding_functions for all
  using (public.owns_wedding(wedding_id));

create policy "decor_selections: client owns via function"
  on public.decor_selections for all
  using (
    exists (
      select 1 from public.wedding_functions wf
      where wf.id = decor_selections.function_id
        and public.owns_wedding(wf.wedding_id)
    )
  );

create policy "artist_bookings: client owns"
  on public.artist_bookings for all
  using (public.owns_wedding(wedding_id));

create policy "fb_selections: client owns via function"
  on public.fb_selections for all
  using (
    exists (
      select 1 from public.wedding_functions wf
      where wf.id = fb_selections.function_id
        and public.owns_wedding(wf.wedding_id)
    )
  );

create policy "logistics_selections: client owns"
  on public.logistics_selections for all
  using (public.owns_wedding(wedding_id));

create policy "budget_estimates: client owns"
  on public.budget_estimates for all
  using (public.owns_wedding(wedding_id));

create policy "budget_actuals: client owns"
  on public.budget_actuals for all
  using (public.owns_wedding(wedding_id));

create policy "scenarios: client owns"
  on public.scenarios for all
  using (public.owns_wedding(wedding_id));

create policy "wedding_wizard_state: client owns via wedding"
  on public.wedding_wizard_state for all
  using (public.owns_wedding(wedding_id));


-- ============================================================
-- 10. SEED DATA
-- ============================================================

-- Cities
insert into public.cities (slug, label, region, multiplier) values
  ('udaipur',   'Udaipur',   'Rajasthan',    1.20),
  ('jaipur',    'Jaipur',    'Rajasthan',    1.10),
  ('mumbai',    'Mumbai',    'Maharashtra',  1.40),
  ('delhi',     'Delhi',     'NCR',          1.30),
  ('goa',       'Goa',       'Goa',          1.30),
  ('bangalore', 'Bangalore', 'Karnataka',    1.20),
  ('hyderabad', 'Hyderabad', 'Telangana',    1.00),
  ('kolkata',   'Kolkata',   'West Bengal',  0.90),
  ('chennai',   'Chennai',   'Tamil Nadu',   1.00),
  ('pune',      'Pune',      'Maharashtra',  1.10);

-- Hotel Tiers
insert into public.hotel_tiers (slug, label, room_rate, cost_mult, decor_mult) values
  ('palace', '5-Star Palace',     25000, 1.50, 1.40),
  ('city5',  '5-Star City Hotel', 15000, 1.20, 1.20),
  ('star4',  '4-Star Hotel',       8000, 1.00, 1.00),
  ('resort', 'Resort',            12000, 1.10, 1.10),
  ('farm',   'Farmhouse / Villa',  6000, 0.85, 0.90);

-- Artists
insert into public.artists (slug, label, artist_type, is_named, cost_min, cost_max) values
  ('dj-local',       'Club DJ (Local)',             'DJ',     false,   50000,   150000),
  ('dj-national',    'DJ (National Name)',           'DJ',     false,  350000,   900000),
  ('band-6piece',    'Live Band (6-piece)',           'Band',   false,  200000,   450000),
  ('singer-tier-b',  'Bollywood Singer – Tier B',    'Singer', false,  600000,  1000000),
  ('singer-tier-a',  'Bollywood Singer – Tier A',    'Singer', false, 1500000,  3000000),
  ('folk-group',     'Folk Artists Group',            'Folk',   false,   80000,   200000),
  ('anchor-celeb',   'Celebrity Anchor',              'Anchor', false,  150000,   350000),
  ('choreo-team',    'Choreographer + Team',          'Choreo', false,   80000,   220000);

-- Meals
insert into public.meals (slug, label, cost_min_ph, cost_max_ph) values
  ('welcome',  'Welcome Dinner',              2200, 4000),
  ('lunch',    'Lunch Buffet',                1400, 2500),
  ('gala',     'Gala Dinner',                 2800, 5000),
  ('floating', 'Floating Snacks / Cocktails',  700, 1500);

-- Bar Tiers
insert into public.bar_tiers (slug, label, cost_min_ph, cost_max_ph) values
  ('dry',  'Dry Event',   0,    0),
  ('wine', 'Beer & Wine', 1000, 2000),
  ('full', 'Full Bar',    2200, 4500);

-- Specialty Counters
insert into public.specialty_counters (slug, label, cost_min, cost_max) values
  ('chaat',    'Chaat Counter',      25000, 45000),
  ('mocktail', 'Mocktail Bar',       28000, 50000),
  ('icecream', 'Ice Cream Station',  22000, 40000),
  ('tea',      'Tea/Coffee 24hr',    18000, 35000),
  ('pasta',    'Live Pasta',         32000, 55000),
  ('sushi',    'Sushi Counter',      40000, 70000);

-- Logistics Rates (single-row config)
insert into public.logistics_rates
  (guests_per_vehicle, vehicle_rate_min, vehicle_rate_max,
   ghodi_min, ghodi_max, dholi_unit_min, dholi_unit_max)
values (3, 4500, 7000, 45000, 90000, 15000, 30000);

-- SFX Items
insert into public.sfx_items (slug, label, cost_fixed, unit) values
  ('cold-pyro',  'Cold Pyro (per stage)',      18000,  'per stage'),
  ('confetti',   'Confetti Cannons (set)',      28000,  'set'),
  ('fog',        'Fog Machine',                 12000,  'unit'),
  ('fireworks',  'Fireworks Display (5 min)',  250000,  'display');

-- Sundries Config (single-row config)
insert into public.sundries_config
  (room_basket_min, room_basket_max, ritual_per_fn_min, ritual_per_fn_max,
   gift_per_guest_min, gift_per_guest_max, stationery_per_guest_min, stationery_per_guest_max,
   photography_min, photography_max, contingency_pct)
values (1800, 3500, 35000, 75000, 500, 1500, 200, 500, 180000, 550000, 0.05);

-- Seed Decor Items
insert into public.decor_items (slug, label, function_type, style, complexity, cost_min, cost_max) values
  ('grand-floral-mandap',   'Grand Floral Mandap',       'pheras',    'Traditional',   'high',   500000,  900000),
  ('marigold-wonderland',   'Marigold Wonderland',        'baraat',    'Traditional',   'medium', 350000,  700000),
  ('crystal-drapes-gala',   'Crystal & Drapes Gala',      'reception', 'Opulent',       'ultra',  800000, 1600000),
  ('boho-pampas-mehendi',   'Boho Pampas Mehendi',        'mehendi',   'Boho',          'medium', 120000,  250000),
  ('neon-disco-sangeet',    'Neon Disco Sangeet',          'sangeet',   'Modern',        'high',   400000,  800000),
  ('pastel-haldi-garden',   'Pastel Haldi Garden',         'haldi',     'Romantic',      'low',     80000,  180000),
  ('palace-grand-reception','Palace Grand Reception',      'reception', 'Opulent',       'ultra', 1500000, 3000000),
  ('tropical-jungle-sangeet','Tropical Jungle Sangeet',   'sangeet',   'Contemporary',  'high',   300000,  550000),
  ('minimalist-white-pheras','Minimalist White Pheras',   'pheras',    'Contemporary',  'medium', 200000,  400000),
  ('mirror-gold-gala',      'Mirror & Gold Gala',          'reception', 'Opulent',       'ultra', 1000000, 2200000);

-- Initial scrape sources (20 sites)
insert into public.scrape_sources (name, base_url, scraper_type, rate_limit_ms) values
  ('WedMeGood',         'https://www.wedmegood.com',           'playwright', 2000),
  ('WeddingWire India', 'https://www.weddingwire.in',          'playwright', 2000),
  ('Meragi Weddings',   'https://www.meragi.com',              'playwright', 2500),
  ('ShaadiSaga',        'https://www.shaadisaga.com',          'cheerio',    1500),
  ('Weddingz',          'https://www.weddingz.in',             'cheerio',    1500),
  ('OneWed',            'https://www.onewed.com',              'cheerio',    1500),
  ('PlanTheWedding',    'https://www.planthewedding.in',       'cheerio',    1500),
  ('WeddingSutra',      'https://www.weddingsutra.com',        'cheerio',    1500),
  ('WedAbout',          'https://www.wedabout.com',            'cheerio',    2000),
  ('The Big Fat Indian Wedding', 'https://www.thebigfatindianwedding.com', 'cheerio', 2000),
  ('BollywoodShaadis',  'https://www.bollywoodshaadis.com',    'cheerio',    2000),
  ('WeddingDoers',      'https://www.weddingdoers.com',        'cheerio',    1500),
  ('MyWeddingBazaar',   'https://www.myweddingbazaar.com',     'cheerio',    1500),
  ('WedNorth',          'https://www.wednorth.com',            'cheerio',    1500),
  ('WeddingPlz',        'https://www.weddingplz.com',          'cheerio',    1500),
  ('Mandap.com',        'https://www.mandap.com',              'cheerio',    1500),
  ('BigIndianWedding.com', 'https://www.bigindianwedding.com', 'cheerio',    1500),
  ('ShaadiDukaan',      'https://www.shaadidukaan.com',        'cheerio',    1500),
  ('Eventila',          'https://www.eventila.com',            'cheerio',    1500),
  ('DreamzCraft',       'https://www.dreamzcraftweddings.com', 'playwright', 2000),
  ('Sabyasachi Decor Blog','https://www.sabyasachi.com',       'playwright', 3000),
  ('Pinterest (Wedding Decor)', 'https://www.pinterest.com',  'playwright', 3000),
  ('Vogue India Weddings','https://www.vogue.in',              'playwright', 2500),
  ('Brides Today',      'https://www.bridestoday.in',          'cheerio',    1500);
