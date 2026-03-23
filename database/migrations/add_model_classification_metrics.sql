alter table public.model_versions
  add column if not exists accuracy numeric(5,4),
  add column if not exists precision numeric(5,4),
  add column if not exists recall numeric(5,4),
  add column if not exists f1_score numeric(5,4);
