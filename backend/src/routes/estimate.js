// routes/estimate.js
const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { supabase }   = require('../lib/supabaseClient');
const { calculateBudget } = require('../services/budgetService');
const { predictCost }     = require('../services/mlService');
const { requireAuth }     = require('../middleware/authMiddleware');

const ML_PREDICT_ENABLED = String(process.env.ML_PREDICT_ENABLED || '').toLowerCase() === 'true'
  || process.env.ML_PREDICT_ENABLED === '1';

function buildArtistPriceRanges(artists) {
  const values = (artists ?? [])
    .map((a) => Number(a.cost_min ?? a.cost_max))
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

// Load reference data once and cache (refreshed every 10 min)
let _refData = null, _refDataAt = 0;
async function getRefData() {
  if (_refData && Date.now() - _refDataAt < 600000) return _refData;
  // Full load via Supabase directly
  const [
    { data: cities }, { data: hotelTiers }, { data: artists }, { data: meals },
    { data: barTiers }, { data: specialtyCounters }, { data: lr }, { data: sfxItems },
    { data: sc }, { data: decor }, { data: eventFunctions },
  ] = await Promise.all([
    supabase.from('cities').select('*').eq('is_active', true),
    supabase.from('hotel_tiers').select('*').eq('is_active', true),
    supabase.from('artists').select('*').eq('is_active', true),
    supabase.from('meals').select('*').eq('is_active', true),
    supabase.from('bar_tiers').select('*').eq('is_active', true),
    supabase.from('specialty_counters').select('*').eq('is_active', true),
    supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
    supabase.from('sfx_items').select('*').eq('is_active', true),
    supabase.from('sundries_config').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
    supabase.from('decor_items').select('*').eq('is_active', true),
    supabase.from('event_functions').select('slug, sort_order').eq('is_active', true).order('sort_order').order('slug'),
  ]);
  const L = lr?.[0];
  const S = sc?.[0];
  const artistRanges = buildArtistPriceRanges(artists ?? []);
  if (!L || !S) {
    throw new Error('Required DB-backed logistics/sundries config missing');
  }

  _refData = {
    cities:    Object.fromEntries((cities ?? []).map(c => [c.slug, { mult: c.multiplier, label: c.label, id: c.id }])),
    hotelTiers:Object.fromEntries((hotelTiers ?? []).map(h => [h.slug, { label: h.label, roomRate: h.room_rate, costMult: h.cost_mult, decorMult: h.decor_mult }])),
    artists:   (artists ?? []).map(a => {
      const value = Number(a.cost_min ?? a.cost_max);
      const priceRangeTag = artistRangeTagForValue(value, artistRanges);
      const range = priceRangeTag ? artistRanges[priceRangeTag] : null;
      return {
        id: a.id,
        slug: a.slug,
        label: a.label,
        type: a.artist_type,
        costMin: a.cost_min,
        costMax: a.cost_max,
        priceRangeTag,
        contributionMin: range?.min ?? null,
        contributionMax: range?.max ?? null,
      };
    }),
    artistRanges,
    meals:     (meals ?? []).map(m => ({ id: m.id, slug: m.slug, label: m.label, costMinPH: m.cost_min_ph, costMaxPH: m.cost_max_ph })),
    barTiers:  (barTiers ?? []).map(b => ({ id: b.id, slug: b.slug, label: b.label, costMinPH: b.cost_min_ph, costMaxPH: b.cost_max_ph })),
    specialtyCounters: (specialtyCounters ?? []).map(c => ({ id: c.id, slug: c.slug, label: c.label, costMin: c.cost_min, costMax: c.cost_max })),
    sfxItems:  (sfxItems ?? []).map(s => ({ id: s.id, slug: s.slug, label: s.label, cost: s.cost_fixed })),
    decor:     (decor ?? []).map(d => ({ id: d.id, label: d.label, function: d.function_type, style: d.style, complexity: d.complexity, costMin: d.cost_min, costMax: d.cost_max })),
    logistics: {
      vehiclePerHead: L.guests_per_vehicle,
      vehicleRateMin: L.vehicle_rate_min,
      vehicleRateMax: L.vehicle_rate_max,
      ghodiMin: L.ghodi_min,
      ghodiMax: L.ghodi_max,
      dholiUnitMin: L.dholi_unit_min,
      dholiUnitMax: L.dholi_unit_max,
    },
    sundries:  {
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
    functions: (eventFunctions ?? []).map((f) => f.slug),
  };
  _refDataAt = Date.now();
  return _refData;
}

// POST /api/estimate — full budget calculation
router.post('/', async (req, res) => {
  try {
    const refData = await getRefData();
    const result  = calculateBudget(req.body, refData);
    let currentEstimateId = null;

    // Optional ML inference for decor items (disabled by default).
    const arrDecors = Array.isArray(req.body.selectedDecors) ? req.body.selectedDecors : [...(req.body.selectedDecors ?? [])];
    if (ML_PREDICT_ENABLED && arrDecors.length > 0) {
      const cityMult = Number(refData.cities?.[req.body.city]?.mult);
      const hotelMult = Number(refData.hotelTiers?.[req.body.hotelTier]?.decorMult);
      if (!Number.isFinite(cityMult) || !Number.isFinite(hotelMult)) {
        throw new Error('Missing DB-backed city/hotel multiplier config for ML estimate enhancement');
      }
      const mlPredictions = await Promise.all(
        arrDecors.map(dId => {
          const d = refData.decor.find(x => x.id === dId);
          if (!d) return null;
          return predictCost({ imageId: dId, functionType: d.function, style: d.style, complexity: d.complexity, cityMult, hotelDecorMult: hotelMult });
        })
      );
      // Replace decor line items with ML predictions where available
      result.mlEnhanced = mlPredictions.filter(Boolean).length > 0;
      result.mlPredictions = mlPredictions.filter(Boolean);
    } else {
      result.mlEnhanced = false;
      result.mlPredictions = [];
    }

    // Save estimate to DB if client is authenticated
    const token = req.headers.authorization?.split(' ')[1];
    if (token && req.body.weddingId) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: wedding } = await supabase
          .from('weddings')
          .select('id')
          .eq('id', req.body.weddingId)
          .eq('client_id', user.id)
          .single();

        if (wedding) {
        // Deactivate previous estimates for this wedding
          await supabase.from('budget_estimates').update({ is_current: false }).eq('wedding_id', req.body.weddingId).eq('is_current', true);
          const { data: insertedEstimate } = await supabase.from('budget_estimates').insert({
            wedding_id:   req.body.weddingId,
            total_min:    result.summary.conservative,
            total_max:    result.summary.luxury,
            total_mid:    result.summary.expected,
            line_items:   result.items,
            generated_by: user.id,
            is_current:   true,
          }).select('id').single();
          currentEstimateId = insertedEstimate?.id ?? null;
        }
      }
    }

    res.json({ id: uuidv4(), ...result, currentEstimateId, calculatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[estimate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estimate/quick — lightweight preview
router.post('/quick', async (req, res) => {
  try {
    const refData = await getRefData();
    const defaultCity = Object.keys(refData.cities ?? {})[0];
    const defaultHotelTier = Object.keys(refData.hotelTiers ?? {})[0];
    const defaultFunctions = (refData.functions ?? []).slice(0, 3);

    if (!defaultCity || !defaultHotelTier || defaultFunctions.length === 0) {
      throw new Error('Missing DB-backed defaults for quick estimate');
    }

    const { city = defaultCity, hotelTier = defaultHotelTier, rooms = 50, guests = 200 } = req.body;
    const result  = calculateBudget({ city, hotelTier, rooms, guests, outstationPct: 50, functions: defaultFunctions }, refData);
    res.json({ summary: result.summary, meta: result.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;