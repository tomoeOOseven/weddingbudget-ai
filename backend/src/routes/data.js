// routes/data.js — all reference data from Supabase
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

function derivePriceRangeTag(priceInr) {
  if (!Number.isFinite(Number(priceInr))) return null;
  const p = Number(priceInr);
  if (p >= 1000 && p < 15000) return 'Budget';
  if (p >= 15000 && p < 80000) return 'Mid-Range';
  if (p >= 80000 && p <= 500000) return 'Premium';
  return null;
}

function rangeBounds(tag, fallbackPrice) {
  if (tag === 'Budget') return { min: 1000, max: 15000 };
  if (tag === 'Mid-Range') return { min: 15000, max: 80000 };
  if (tag === 'Premium') return { min: 80000, max: 500000 };
  if (Number.isFinite(Number(fallbackPrice))) {
    const p = Number(fallbackPrice);
    return { min: Math.max(1000, Math.round(p * 0.9)), max: Math.round(p * 1.1) };
  }
  return null;
}

function buildArtistPriceRanges(artists) {
  const values = (artists ?? [])
    .map((a) => {
      const meta = parseArtistNotes(a.notes);
      return Number(a.price_inr ?? meta.price_inr ?? a.cost_min ?? a.cost_max);
    })
    .filter((v) => Number.isFinite(v));
  if (!values.length) {
    return {
      Budget: { min: 10000, max: 30000 },
      'Mid-Range': { min: 30001, max: 70000 },
      Premium: { min: 70001, max: 150000 },
    };
  }

  const min = Math.round(Math.min(...values));
  const max = Math.round(Math.max(...values));
  if (min === max) {
    const spread = Math.max(3000, Math.round(min * 0.15));
    return {
      Budget: { min: Math.max(1000, min - spread), max: min },
      'Mid-Range': { min: min + 1, max: min + spread },
      Premium: { min: min + spread + 1, max: min + spread * 2 },
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

function artistRangeTagForValue(value, ranges) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v <= ranges.Budget.max) return 'Budget';
  if (v <= ranges['Mid-Range'].max) return 'Mid-Range';
  return 'Premium';
}

router.get('/all', async (req, res) => {
  try {
    const [
      { data: cities }, { data: hotelTiers }, { data: artists },
      { data: meals }, { data: barTiers }, { data: specialtyCounters },
      { data: logisticsRates }, { data: sfxItems }, { data: sundriesConfig },
      { data: eventFunctions },
    ] = await Promise.all([
      supabase.from('cities').select('*').eq('is_active', true).order('label'),
      supabase.from('hotel_tiers').select('*').eq('is_active', true),
      supabase.from('artists').select('*').eq('is_active', true).order('artist_type'),
      supabase.from('meals').select('*').eq('is_active', true),
      supabase.from('bar_tiers').select('*').eq('is_active', true),
      supabase.from('specialty_counters').select('*').eq('is_active', true),
      supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
      supabase.from('sfx_items').select('*').eq('is_active', true),
      supabase.from('sundries_config').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
      supabase.from('event_functions').select('id, slug, label, emoji, sort_order').eq('is_active', true).order('sort_order').order('label'),
    ]);

    const { data: scrapedDecor } = await supabase
      .from('scraped_images')
      .select(`id, title, storage_path, image_url, price_inr, price_text, price_range_tag, image_labels ( function_type, style, complexity, confidence )`)
      .not('price_inr', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    const L = logisticsRates?.[0];
    const S = sundriesConfig?.[0];
    const SURL = process.env.SUPABASE_URL;

    if (!L || !S) {
      return res.status(500).json({ error: 'Required reference config missing in database.' });
    }

    const cityMap  = Object.fromEntries((cities ?? []).map(c => [c.slug, { mult: c.multiplier, label: c.label, region: c.region, id: c.id }]));
    const hotelMap = Object.fromEntries((hotelTiers ?? []).map(h => [h.slug, { label: h.label, roomRate: h.room_rate, costMult: h.cost_mult, decorMult: h.decor_mult, id: h.id }]));
    const artistRanges = buildArtistPriceRanges(artists ?? []);

    const scrapedMapped = (scrapedDecor ?? [])
      .map(img => {
        const lbl = img.image_labels?.[0] ?? {};
        const priceRangeTag = img.price_range_tag || derivePriceRangeTag(img.price_inr);
        const bounds = rangeBounds(priceRangeTag, img.price_inr);
        if (!bounds) return null;
        return {
          id: img.id, label: img.title ?? 'Scraped Design',
          function: lbl.function_type ?? 'other',
          style: lbl.style ?? 'Traditional',
          complexity: lbl.complexity ?? 'medium',
          costMin: bounds.min,
          costMax: bounds.max,
          confidence: lbl.confidence ?? null,
          priceInr: img.price_inr,
          priceRangeTag,
          imageUrl: img.storage_path ? `${SURL}/storage/v1/object/public/decor-images/${img.storage_path}` : img.image_url,
          source: 'scraped',
        };
      })
      .filter(Boolean);

    res.json({
      cities: cityMap, hotelTiers: hotelMap,
      artists: (artists ?? []).map(a => {
        const meta = parseArtistNotes(a.notes);
        const value = Number(a.price_inr ?? meta.price_inr ?? a.cost_min ?? a.cost_max);
        const priceRangeTag = a.price_range_tag || meta.price_range_tag || artistRangeTagForValue(value, artistRanges);
        const range = priceRangeTag ? artistRanges[priceRangeTag] : null;
        return {
          id: a.id,
          slug: a.slug,
          label: a.label,
          type: a.artist_type,
          isNamed: a.is_named,
          imageUrl: a.image_url ?? meta.image_url ?? null,
          profileUrl: a.profile_url ?? meta.profile_url ?? null,
          priceInr: a.price_inr ?? (Number.isFinite(value) ? value : null),
          costMin: a.cost_min,
          costMax: a.cost_max,
          priceRangeTag,
          contributionMin: range?.min ?? null,
          contributionMax: range?.max ?? null,
        };
      }),
      artistRanges,
      meals: (meals ?? []).map(m => ({ id: m.id, slug: m.slug, label: m.label, costMinPH: m.cost_min_ph, costMaxPH: m.cost_max_ph })),
      barTiers: (barTiers ?? []).map(b => ({ id: b.id, slug: b.slug, label: b.label, costMinPH: b.cost_min_ph, costMaxPH: b.cost_max_ph })),
      specialtyCounters: (specialtyCounters ?? []).map(c => ({ id: c.id, slug: c.slug, label: c.label, costMin: c.cost_min, costMax: c.cost_max })),
      sfxItems: (sfxItems ?? []).map(s => ({ id: s.id, slug: s.slug, label: s.label, cost: s.cost_fixed, unit: s.unit })),
      logistics: {
        vehiclePerHead: L.guests_per_vehicle,
        vehicleRateMin: L.vehicle_rate_min,
        vehicleRateMax: L.vehicle_rate_max,
        ghodiMin: L.ghodi_min,
        ghodiMax: L.ghodi_max,
        dholiUnitMin: L.dholi_unit_min,
        dholiUnitMax: L.dholi_unit_max,
      },
      sundries: {
        roomBasketMin: S.room_basket_min,
        roomBasketMax: S.room_basket_max,
        ritualPerFnMin: S.ritual_per_fn_min,
        ritualPerFnMax: S.ritual_per_fn_max,
        giftPerGuestMin: S.gift_per_guest_min,
        giftPerGuestMax: S.gift_per_guest_max,
        stationeryPerGuestMin: S.stationery_per_guest_min,
        stationeryPerGuestMax: S.stationery_per_guest_max,
        photographyMin: S.photography_min,
        photographyMax: S.photography_max,
        contingencyPct: S.contingency_pct,
      },
      decor: scrapedMapped,
      functions: (eventFunctions ?? []).map((fn) => ({ id: fn.slug, label: fn.label, emoji: fn.emoji })),
    });
  } catch (err) {
    console.error('[data/all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;