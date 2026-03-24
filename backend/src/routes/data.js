// routes/data.js — all reference data from Supabase
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

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
      // Keep client artist page on original seeded tiers, excluding named/CSV-imported acts.
      supabase.from('artists').select('*').eq('is_active', true).eq('is_named', false).order('artist_type'),
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
      artists: (artists ?? []).map(a => ({ id: a.id, slug: a.slug, label: a.label, type: a.artist_type, isNamed: a.is_named, costMin: a.cost_min, costMax: a.cost_max })),
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