// routes/data.js — all reference data from Supabase
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

router.get('/all', async (req, res) => {
  try {
    const [
      { data: cities }, { data: hotelTiers }, { data: artists },
      { data: meals }, { data: barTiers }, { data: specialtyCounters },
      { data: logisticsRates }, { data: sfxItems }, { data: sundriesConfig },
      { data: decor },
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
      supabase.from('decor_items').select('*').eq('is_active', true).order('function_type'),
    ]);

    const { data: scrapedDecor } = await supabase
      .from('scraped_images')
      .select(`id, title, storage_path, image_url, image_labels ( function_type, style, complexity, cost_seed_min, cost_seed_max, confidence )`)
      .eq('status', 'labelled')
      .order('created_at', { ascending: false })
      .limit(300);

    const L = logisticsRates?.[0] ?? {};
    const S = sundriesConfig?.[0]  ?? {};
    const SURL = process.env.SUPABASE_URL;

    const cityMap  = Object.fromEntries((cities ?? []).map(c => [c.slug, { mult: c.multiplier, label: c.label, region: c.region, id: c.id }]));
    const hotelMap = Object.fromEntries((hotelTiers ?? []).map(h => [h.slug, { label: h.label, roomRate: h.room_rate, costMult: h.cost_mult, decorMult: h.decor_mult, id: h.id }]));

    const seedDecor = (decor ?? []).map(d => ({
      id: d.id, slug: d.slug, label: d.label, function: d.function_type,
      style: d.style, complexity: d.complexity, costMin: d.cost_min, costMax: d.cost_max,
      imageUrl: d.image_url ? `${SURL}/storage/v1/object/public/decor-images/${d.image_url}` : null,
      source: 'seed',
    }));

    const scrapedMapped = (scrapedDecor ?? [])
      .filter(img => img.image_labels?.length > 0)
      .map(img => {
        const lbl = img.image_labels[0];
        return {
          id: img.id, label: img.title ?? 'Scraped Design',
          function: lbl.function_type, style: lbl.style, complexity: lbl.complexity,
          costMin: lbl.cost_seed_min, costMax: lbl.cost_seed_max, confidence: lbl.confidence,
          imageUrl: img.storage_path ? `${SURL}/storage/v1/object/public/decor-images/${img.storage_path}` : img.image_url,
          source: 'scraped',
        };
      });

    res.json({
      cities: cityMap, hotelTiers: hotelMap,
      artists: (artists ?? []).map(a => ({ id: a.id, slug: a.slug, label: a.label, type: a.artist_type, isNamed: a.is_named, costMin: a.cost_min, costMax: a.cost_max })),
      meals: (meals ?? []).map(m => ({ id: m.id, slug: m.slug, label: m.label, costMinPH: m.cost_min_ph, costMaxPH: m.cost_max_ph })),
      barTiers: (barTiers ?? []).map(b => ({ id: b.id, slug: b.slug, label: b.label, costMinPH: b.cost_min_ph, costMaxPH: b.cost_max_ph })),
      specialtyCounters: (specialtyCounters ?? []).map(c => ({ id: c.id, slug: c.slug, label: c.label, costMin: c.cost_min, costMax: c.cost_max })),
      sfxItems: (sfxItems ?? []).map(s => ({ id: s.id, slug: s.slug, label: s.label, cost: s.cost_fixed, unit: s.unit })),
      logistics: { vehiclePerHead: L.guests_per_vehicle ?? 3, vehicleRateMin: L.vehicle_rate_min ?? 4500, vehicleRateMax: L.vehicle_rate_max ?? 7000, ghodiMin: L.ghodi_min ?? 45000, ghodiMax: L.ghodi_max ?? 90000, dholiUnitMin: L.dholi_unit_min ?? 15000, dholiUnitMax: L.dholi_unit_max ?? 30000 },
      sundries: { roomBasketMin: S.room_basket_min ?? 1800, roomBasketMax: S.room_basket_max ?? 3500, ritualPerFnMin: S.ritual_per_fn_min ?? 35000, ritualPerFnMax: S.ritual_per_fn_max ?? 75000, giftPerGuestMin: S.gift_per_guest_min ?? 500, giftPerGuestMax: S.gift_per_guest_max ?? 1500, stationeryPerGuestMin: S.stationery_per_guest_min ?? 200, stationeryPerGuestMax: S.stationery_per_guest_max ?? 500, photographyMin: S.photography_min ?? 180000, photographyMax: S.photography_max ?? 550000, contingencyPct: S.contingency_pct ?? 0.05 },
      decor: [...seedDecor, ...scrapedMapped],
      functions: [
        { id: 'haldi', label: 'Haldi', emoji: '💛' }, { id: 'mehendi', label: 'Mehendi', emoji: '🌿' },
        { id: 'sangeet', label: 'Sangeet', emoji: '🎵' }, { id: 'baraat', label: 'Baraat', emoji: '🐴' },
        { id: 'pheras', label: 'Pheras', emoji: '🔥' }, { id: 'reception', label: 'Reception', emoji: '✨' },
      ],
    });
  } catch (err) {
    console.error('[data/all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;