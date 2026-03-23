-- Normalize WedMeGood scrape source to one canonical decorators link only.

insert into public.scrape_sources (
  name,
  base_url,
  scraper_type,
  url_patterns,
  rate_limit_ms,
  is_active
)
values (
  'WedMeGood',
  'https://www.wedmegood.com/vendors/all/wedding-decorators/',
  'cheerio',
  '["https://www.wedmegood.com/vendors/all/wedding-decorators/"]'::jsonb,
  1500,
  true
)
on conflict (base_url) do update
set
  name = excluded.name,
  scraper_type = excluded.scraper_type,
  url_patterns = excluded.url_patterns,
  is_active = true,
  updated_at = now();

-- Remove all non-canonical WedMeGood source rows.
delete from public.scrape_sources
where lower(base_url) like '%wedmegood.com%'
  and lower(base_url) <> 'https://www.wedmegood.com/vendors/all/wedding-decorators/';

-- Ensure canonical row keeps only canonical url pattern.
update public.scrape_sources
set
  url_patterns = '["https://www.wedmegood.com/vendors/all/wedding-decorators/"]'::jsonb,
  updated_at = now()
where lower(base_url) = 'https://www.wedmegood.com/vendors/all/wedding-decorators/';
