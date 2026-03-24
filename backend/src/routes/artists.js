// routes/artists.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

function parseArtistNotes(notes) {
  const out = {};
  String(notes || '').split('|').forEach((chunk) => {
    const [k, ...rest] = chunk.split('=');
    if (!k || rest.length === 0) return;
    out[k.trim()] = rest.join('=').trim();
  });
  return out;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function interleaveByType(rows) {
  const buckets = new Map();
  rows.forEach((row) => {
    const key = row.artist_type || 'Other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });

  const keys = [...buckets.keys()].sort();
  keys.forEach((k) => shuffleInPlace(buckets.get(k)));

  const out = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const k of keys) {
      const bucket = buckets.get(k);
      if (bucket.length > 0) {
        out.push(bucket.shift());
        remaining = true;
      }
    }
  }
  return out;
}

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 24, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const shuffle = String(req.query.shuffle || '').toLowerCase() === 'true' || req.query.shuffle === '1';

  let query = supabase.from('artists').select('*').eq('is_active', true).order('label');
  if (req.query.type) query = query.eq('artist_type', req.query.type);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let rows = data ?? [];
  if (shuffle) {
    rows = interleaveByType(rows);
  }

  const paged = rows.slice(offset, offset + limit).map((a) => {
    const meta = parseArtistNotes(a.notes);
    const metaPrice = Number(meta.price_inr);
    return {
      id: a.id,
      slug: a.slug,
      label: a.label,
      type: a.artist_type,
      priceInr: a.price_inr ?? (Number.isFinite(metaPrice) ? metaPrice : null),
      priceRangeTag: a.price_range_tag ?? meta.price_range_tag ?? null,
      contributionMin: a.cost_min,
      contributionMax: a.cost_max,
      image_url: a.image_url ?? meta.image_url ?? null,
      profile_url: a.profile_url ?? meta.profile_url ?? null,
    };
  });
  res.json({
    artists: paged,
    total: rows.length,
    offset,
    limit,
  });
});

module.exports = router;