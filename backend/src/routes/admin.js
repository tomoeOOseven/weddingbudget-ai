// routes/admin.js — cost data management with full audit trail
const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { getHomepageContent, saveHomepageContent } = require('../lib/siteContentStore');

// ── Generic versioned update helper ──────────────────────────────────────────
async function updateCostRow(table, id, updates, adminId) {
  const allowed = Object.keys(updates).filter(k => !['id','version','created_at'].includes(k));
  const payload = {};
  allowed.forEach(k => { payload[k] = updates[k]; });
  payload.updated_by = adminId;
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from(table)
    .update(payload).eq('id', id).select().single();
  return { data, error };
}

function buildArtistRanges(minValue, maxValue) {
  const min = Math.round(Number(minValue));
  const max = Math.round(Number(maxValue));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
    return {
      Budget: { min: 10000, max: 30000 },
      'Mid-Range': { min: 30001, max: 70000 },
      Premium: { min: 70001, max: 150000 },
    };
  }
  const step = (max - min) / 3;
  const budgetMax = Math.round(min + step);
  const midMax = Math.round(min + step * 2);
  return {
    Budget: { min, max: budgetMax },
    'Mid-Range': { min: budgetMax + 1, max: midMax },
    Premium: { min: midMax + 1, max },
  };
}

function tagFromPrice(price, ranges) {
  const p = Number(price);
  if (!Number.isFinite(p)) return null;
  if (p <= ranges.Budget.max) return 'Budget';
  if (p <= ranges['Mid-Range'].max) return 'Mid-Range';
  return 'Premium';
}

function parseArtistNotes(notes) {
  const out = {};
  String(notes || '').split('|').forEach((chunk) => {
    const [k, ...rest] = chunk.split('=');
    if (!k || rest.length === 0) return;
    out[k.trim()] = rest.join('=').trim();
  });
  return out;
}

async function getCurrentArtistRanges(incomingPrice = null) {
  const { data: artists } = await supabaseAdmin
    .from('artists')
    .select('price_inr, cost_min')
    .eq('is_active', true);

  const values = (artists ?? [])
    .map((a) => Number(a.price_inr ?? a.cost_min))
    .filter((v) => Number.isFinite(v));
  if (Number.isFinite(Number(incomingPrice))) values.push(Number(incomingPrice));
  if (!values.length) return buildArtistRanges(10000, 150000);
  return buildArtistRanges(Math.min(...values), Math.max(...values));
}

// ── CITIES ────────────────────────────────────────────────────────────────────
router.get('/cities', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('cities').select('*').order('label');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ cities: data });
});

router.put('/cities/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('cities', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ city: data, message: 'City updated.' });
});

// ── HOTEL TIERS ───────────────────────────────────────────────────────────────
router.get('/hotels', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('hotel_tiers').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tiers: data });
});

router.put('/hotels/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('hotel_tiers', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tier: data, message: 'Hotel tier updated.' });
});

// ── ARTISTS ───────────────────────────────────────────────────────────────────
router.get('/artists', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('artists').select('*').order('artist_type');
  if (error) return res.status(500).json({ error: error.message });
  const artists = (data ?? []).map((a) => {
    const meta = parseArtistNotes(a.notes);
    return {
      ...a,
      price_inr: a.price_inr ?? (Number.isFinite(Number(meta.price_inr)) ? Number(meta.price_inr) : null),
      price_range_tag: a.price_range_tag ?? meta.price_range_tag ?? null,
      image_url: a.image_url ?? meta.image_url ?? null,
      profile_url: a.profile_url ?? meta.profile_url ?? null,
    };
  });
  res.json({ artists });
});

router.post('/artists', requireAdmin, async (req, res) => {
  const {
    label,
    artist_type,
    price_inr,
    image_url,
    profile_url,
    is_named = false,
    notes,
  } = req.body;
  if (!label || !artist_type || !price_inr) {
    return res.status(400).json({ error: 'label, artist_type, price_inr required.' });
  }

  const price = Math.round(Number(price_inr));
  if (!Number.isFinite(price) || price < 1000) {
    return res.status(400).json({ error: 'price_inr must be a valid number >= 1000.' });
  }

  const ranges = await getCurrentArtistRanges(price);
  const price_range_tag = tagFromPrice(price, ranges);
  const range = ranges[price_range_tag];

  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
  let { data, error } = await supabaseAdmin.from('artists').insert({
    slug,
    label,
    artist_type,
    price_inr: price,
    price_range_tag,
    cost_min: range.min,
    cost_max: range.max,
    image_url: image_url ?? null,
    profile_url: profile_url ?? null,
    is_named,
    notes,
    updated_by: req.profile.id,
  }).select().single();

  if (
    error?.message?.toLowerCase().includes('column') &&
    (error?.message?.toLowerCase().includes('does not exist') || error?.message?.toLowerCase().includes('could not find'))
  ) {
    const mergedNotes = [notes, `price_inr=${price}`, `price_range_tag=${price_range_tag}`, image_url ? `image_url=${image_url}` : null, profile_url ? `profile_url=${profile_url}` : null]
      .filter(Boolean)
      .join(' | ');
    ({ data, error } = await supabaseAdmin.from('artists').insert({
      slug,
      label,
      artist_type,
      cost_min: range.min,
      cost_max: range.max,
      is_named,
      notes: mergedNotes,
      updated_by: req.profile.id,
    }).select().single());
  }

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ artist: data });
});

router.put('/artists/:id', requireAdmin, async (req, res) => {
  const updates = { ...req.body };
  if (updates.price_inr != null) {
    const price = Math.round(Number(updates.price_inr));
    if (!Number.isFinite(price) || price < 1000) {
      return res.status(400).json({ error: 'price_inr must be a valid number >= 1000.' });
    }
    const ranges = await getCurrentArtistRanges(price);
    const price_range_tag = tagFromPrice(price, ranges);
    const range = ranges[price_range_tag];
    updates.price_inr = price;
    updates.price_range_tag = price_range_tag;
    updates.cost_min = range.min;
    updates.cost_max = range.max;
  }

  let { data, error } = await updateCostRow('artists', req.params.id, updates, req.profile.id);
  if (
    error?.message?.toLowerCase().includes('column') &&
    (error?.message?.toLowerCase().includes('does not exist') || error?.message?.toLowerCase().includes('could not find'))
  ) {
    const fallbackUpdates = { ...updates };
    delete fallbackUpdates.price_inr;
    delete fallbackUpdates.price_range_tag;
    delete fallbackUpdates.image_url;
    delete fallbackUpdates.profile_url;
    ({ data, error } = await updateCostRow('artists', req.params.id, fallbackUpdates, req.profile.id));
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json({ artist: data, message: 'Artist updated.' });
});

router.delete('/artists/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('artists').update({ is_active: false, updated_by: req.profile.id }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Artist deactivated.' });
});

// ── MEALS ─────────────────────────────────────────────────────────────────────
router.get('/meals', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('meals').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ meals: data ?? [] });
});
router.put('/meals/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('meals', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ meal: data });
});

// ── BAR TIERS ─────────────────────────────────────────────────────────────────
router.get('/bar-tiers', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('bar_tiers').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ barTiers: data ?? [] });
});
router.put('/bar-tiers/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('bar_tiers', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ barTier: data });
});

// ── SPECIALTY COUNTERS ────────────────────────────────────────────────────────
router.get('/specialty-counters', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('specialty_counters').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ counters: data ?? [] });
});
router.put('/specialty-counters/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('specialty_counters', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ counter: data });
});

// ── LOGISTICS ─────────────────────────────────────────────────────────────────
router.get('/logistics', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logistics: data?.[0] ?? null });
});
router.put('/logistics/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('logistics_rates', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logistics: data });
});

// ── SFX ───────────────────────────────────────────────────────────────────────
router.get('/sfx', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('sfx_items').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sfx: data ?? [] });
});
router.put('/sfx/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('sfx_items', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

// ── SUNDRIES ──────────────────────────────────────────────────────────────────
router.get('/sundries', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('sundries_config').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sundries: data?.[0] ?? null });
});
router.put('/sundries/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('sundries_config', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sundries: data });
});

// ── DECOR ITEMS ───────────────────────────────────────────────────────────────
router.get('/decor', requireAdmin, async (req, res) => {
  const { data } = await supabaseAdmin.from('decor_items').select('*').order('function_type');
  res.json({ items: data ?? [], total: data?.length ?? 0 });
});
router.post('/decor', requireAdmin, async (req, res) => {
  const { label, function_type, style, complexity, cost_min, cost_max } = req.body;
  if (!label || !function_type || !style || !complexity) return res.status(400).json({ error: 'label, function_type, style, complexity required.' });
  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
  const { data, error } = await supabaseAdmin.from('decor_items').insert({ slug, label, function_type, style, complexity, cost_min: cost_min ?? 0, cost_max: cost_max ?? 0, updated_by: req.profile.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ item: data });
});
router.put('/decor/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('decor_items', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
router.get('/audit', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  let query = supabaseAdmin.from('audit_log')
    .select('*, profiles!changed_by ( full_name, email )', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (req.query.table) query = query.eq('table_name', req.query.table);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ log: data ?? [], total: count, offset, limit });
});

// ── WEBSITE CONTENT (homepage cards + games) ───────────────────────────────
router.get('/website-content', requireAdmin, async (req, res) => {
  try {
    const content = await getHomepageContent();
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/website-content', requireAdmin, async (req, res) => {
  try {
    const content = await saveHomepageContent(req.body, req.profile.id);
    res.json({ content, message: 'Website content updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;