-- Add derived price range tag to scraped_images and backfill from price_inr

alter table public.scraped_images
  add column if not exists price_range_tag text;

update public.scraped_images
set price_range_tag = case
  when price_inr >= 1000 and price_inr < 15000 then 'Budget'
  when price_inr >= 15000 and price_inr < 80000 then 'Mid-Range'
  when price_inr >= 80000 and price_inr <= 500000 then 'Premium'
  else null
end
where price_inr is not null
  and (price_range_tag is null or price_range_tag = '');

create index if not exists idx_scraped_images_price_range_tag
  on public.scraped_images (price_range_tag);
