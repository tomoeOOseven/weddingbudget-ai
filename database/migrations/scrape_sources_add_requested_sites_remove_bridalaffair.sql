-- Add requested scrape sources if missing and remove BridalAffair

insert into public.scrape_sources (name, base_url, scraper_type, rate_limit_ms)
values
  ('Weddingz', 'https://weddingz.in', 'cheerio', 1500),
  ('WeddingPlz', 'https://www.weddingplz.com', 'cheerio', 1500),
  ('Mandap.com', 'https://www.mandap.com', 'cheerio', 1500),
  ('BigIndianWedding.com', 'https://www.bigindianwedding.com', 'cheerio', 1500),
  ('ShaadiDukaan', 'https://www.shaadidukaan.com', 'cheerio', 1500),
  ('Eventila', 'https://www.eventila.com', 'cheerio', 1500)
on conflict (base_url) do update
set
  name = excluded.name,
  scraper_type = excluded.scraper_type,
  rate_limit_ms = excluded.rate_limit_ms,
  updated_at = now();

delete from public.scrape_sources
where lower(base_url) in (
  'https://www.bridalaffair.in',
  'http://www.bridalaffair.in',
  'https://bridalaffair.in',
  'http://bridalaffair.in'
);
