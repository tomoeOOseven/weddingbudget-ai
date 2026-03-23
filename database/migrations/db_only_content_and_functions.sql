-- Enforce DB-backed content/reference data for homepage content and event functions.

create table if not exists public.website_content (
  content_key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_functions (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  label text not null,
  emoji text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.event_functions (slug, label, emoji, sort_order)
values
  ('haldi', 'Haldi', '💛', 10),
  ('mehendi', 'Mehendi', '🌿', 20),
  ('sangeet', 'Sangeet', '🎵', 30),
  ('baraat', 'Baraat', '🐴', 40),
  ('pheras', 'Pheras', '🔥', 50),
  ('reception', 'Reception', '✨', 60)
on conflict (slug) do update
set
  label = excluded.label,
  emoji = excluded.emoji,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.website_content (content_key, content)
values (
  'homepage',
  '{
    "cards": [
      {
        "imageUrl": "/cards/card-1.webp",
        "canvaUrl": "https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=19f52fa6-29f8-4bce-8f40-833138075e25&ui=eyJBIjp7fX0"
      },
      {
        "imageUrl": "/cards/card-2.webp",
        "canvaUrl": "https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=2f84d2d1-7d5b-4eca-87aa-6dceb2e56148&ui=eyJBIjp7fX0"
      },
      {
        "imageUrl": "/cards/card-3.webp",
        "canvaUrl": "https://www.canva.com/design?create&type=TACixRR28vY&template=EAF6Q0JILnc&category=tAEwhV3GgCA&analyticsCorrelationId=c701427e-197f-42c5-a918-b948f628c313&ui=eyJBIjp7fX0"
      },
      {
        "imageUrl": "/cards/card-4.webp",
        "canvaUrl": "https://www.canva.com/design?create&type=TACixRR28vY&template=EAFAHubY-xY&category=tAEwhV3GgCA&analyticsCorrelationId=9a9b180d-7546-4b3f-b1bf-e89f2fa3cd9a&ui=eyJBIjp7fX0"
      },
      {
        "imageUrl": "/cards/card-5.webp",
        "canvaUrl": "https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHYRSfM2M&category=tAEwhV3GgCA&analyticsCorrelationId=d2ca7e22-e222-45d5-8435-6dc8fe6858f6&ui=eyJBIjp7fX0"
      }
    ],
    "games": [
      {
        "title": "Joota Chupai Showdown",
        "desc": "The bride side hides the groom shoes and negotiates a playful ransom while the baraat cheers.",
        "imageUrl": "/games/game-1.jpg"
      },
      {
        "title": "Guess The Couple Moment",
        "desc": "Guests decode story clues from photos and vows, then race to guess the couple memory first.",
        "imageUrl": "/games/game-2.webp"
      },
      {
        "title": "Wedding Bingo",
        "desc": "Mark iconic moments like varmala smiles, dance circles, and emotional speeches on custom bingo cards.",
        "imageUrl": "/games/game-3.webp"
      },
      {
        "title": "Ring Hunt Challenge",
        "desc": "Bride and groom search for the hidden ring in a playful bowl game with full family commentary.",
        "imageUrl": "/games/game-4.webp"
      }
    ]
  }'::jsonb
)
on conflict (content_key) do update
set
  content = excluded.content,
  updated_at = now();
