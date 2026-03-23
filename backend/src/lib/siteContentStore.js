const { supabaseAdmin } = require('../middleware/authMiddleware');

const BUCKET = process.env.SITE_CONTENT_BUCKET || 'decor-images';
const HOMEPAGE_PATH = 'site-content/homepage.json';

const DEFAULT_HOMEPAGE_CONTENT = {
  cards: [
    {
      imageUrl: '/cards/card-1.webp',
      canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=19f52fa6-29f8-4bce-8f40-833138075e25&ui=eyJBIjp7fX0',
    },
    {
      imageUrl: '/cards/card-2.webp',
      canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHX05Aq_4&category=tAEwhV3GgCA&analyticsCorrelationId=2f84d2d1-7d5b-4eca-87aa-6dceb2e56148&ui=eyJBIjp7fX0',
    },
    {
      imageUrl: '/cards/card-3.webp',
      canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAF6Q0JILnc&category=tAEwhV3GgCA&analyticsCorrelationId=c701427e-197f-42c5-a918-b948f628c313&ui=eyJBIjp7fX0',
    },
    {
      imageUrl: '/cards/card-4.webp',
      canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAFAHubY-xY&category=tAEwhV3GgCA&analyticsCorrelationId=9a9b180d-7546-4b3f-b1bf-e89f2fa3cd9a&ui=eyJBIjp7fX0',
    },
    {
      imageUrl: '/cards/card-5.webp',
      canvaUrl: 'https://www.canva.com/design?create&type=TACixRR28vY&template=EAGHYRSfM2M&category=tAEwhV3GgCA&analyticsCorrelationId=d2ca7e22-e222-45d5-8435-6dc8fe6858f6&ui=eyJBIjp7fX0',
    },
  ],
  games: [
    {
      title: 'Joota Chupai Showdown',
      desc: 'The bride side hides the groom shoes and negotiates a playful ransom while the baraat cheers.',
      imageUrl: '/games/game-1.jpg',
    },
    {
      title: 'Guess The Couple Moment',
      desc: 'Guests decode story clues from photos and vows, then race to guess the couple memory first.',
      imageUrl: '/games/game-2.webp',
    },
    {
      title: 'Wedding Bingo',
      desc: 'Mark iconic moments like varmala smiles, dance circles, and emotional speeches on custom bingo cards.',
      imageUrl: '/games/game-3.webp',
    },
    {
      title: 'Ring Hunt Challenge',
      desc: 'Bride and groom search for the hidden ring in a playful bowl game with full family commentary.',
      imageUrl: '/games/game-4.webp',
    },
  ],
};

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((c) => ({
      imageUrl: String(c?.imageUrl || '').trim(),
      canvaUrl: String(c?.canvaUrl || '').trim(),
    }))
    .filter((c) => c.imageUrl && c.canvaUrl);
}

function normalizeGames(games) {
  if (!Array.isArray(games)) return [];
  return games
    .map((g) => ({
      title: String(g?.title || '').trim(),
      desc: String(g?.desc || '').trim(),
      imageUrl: String(g?.imageUrl || '').trim(),
    }))
    .filter((g) => g.title && g.desc && g.imageUrl);
}

function normalizeContent(raw = {}) {
  const cards = normalizeCards(raw.cards);
  const games = normalizeGames(raw.games);
  return {
    cards: cards.length ? cards : DEFAULT_HOMEPAGE_CONTENT.cards,
    games: games.length ? games : DEFAULT_HOMEPAGE_CONTENT.games,
  };
}

async function getHomepageContent() {
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(HOMEPAGE_PATH);
    if (error || !data) return DEFAULT_HOMEPAGE_CONTENT;

    const text = await data.text();
    const parsed = JSON.parse(text);
    return normalizeContent(parsed);
  } catch {
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}

async function saveHomepageContent(content) {
  const normalized = normalizeContent(content);
  const payload = Buffer.from(JSON.stringify(normalized, null, 2), 'utf-8');

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(HOMEPAGE_PATH, payload, {
      contentType: 'application/json',
      upsert: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return normalized;
}

module.exports = {
  getHomepageContent,
  saveHomepageContent,
  DEFAULT_HOMEPAGE_CONTENT,
};
