const { supabaseAdmin } = require('../middleware/authMiddleware');

const HOMEPAGE_CONTENT_KEY = 'homepage';

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
  return {
    cards: normalizeCards(raw.cards),
    games: normalizeGames(raw.games),
  };
}

async function getHomepageContent() {
  const { data, error } = await supabaseAdmin
    .from('website_content')
    .select('content')
    .eq('content_key', HOMEPAGE_CONTENT_KEY)
    .single();

  if (error) {
    // Missing row means content has not been seeded yet.
    if (error.code === 'PGRST116') return { cards: [], games: [] };
    throw new Error(error.message);
  }

  return normalizeContent(data?.content ?? {});
}

async function saveHomepageContent(content, updatedBy = null) {
  const normalized = normalizeContent(content);

  const payload = {
    content_key: HOMEPAGE_CONTENT_KEY,
    content: normalized,
    updated_at: new Date().toISOString(),
  };

  if (updatedBy) payload.updated_by = updatedBy;

  const { error } = await supabaseAdmin
    .from('website_content')
    .upsert(payload, { onConflict: 'content_key' });

  if (error) {
    throw new Error(error.message);
  }

  return normalized;
}

module.exports = {
  getHomepageContent,
  saveHomepageContent,
};
