alter table public.artists
  add column if not exists price_inr integer,
  add column if not exists price_range_tag text,
  add column if not exists image_url text,
  add column if not exists profile_url text;

create index if not exists idx_artists_price_range_tag
  on public.artists (price_range_tag);
