-- Add scraped price fields to scraped_images

alter table public.scraped_images
  add column if not exists price_text text,
  add column if not exists price_inr integer;

create index if not exists idx_scraped_images_price_inr on public.scraped_images (price_inr);
