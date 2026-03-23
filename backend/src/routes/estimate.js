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

// Load reference data once and cache (refreshed every 10 min)
let _refData = null, _refDataAt = 0;
async function getRefData() {
  if (_refData && Date.now() - _refDataAt < 600000) return _refData;
  // Full load via Supabase directly
  const [
    { data: cities }, { data: hotelTiers }, { data: artists }, { data: meals },
    { data: barTiers }, { data: specialtyCounters }, { data: lr }, { data: sfxItems },
    { data: sc }, { data: decor },
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
  ]);
  const L = lr?.[0] ?? {}, S = sc?.[0] ?? {};
  _refData = {
    cities:    Object.fromEntries((cities ?? []).map(c => [c.slug, { mult: c.multiplier, label: c.label, id: c.id }])),
    hotelTiers:Object.fromEntries((hotelTiers ?? []).map(h => [h.slug, { label: h.label, roomRate: h.room_rate, costMult: h.cost_mult, decorMult: h.decor_mult }])),
    artists:   (artists ?? []).map(a => ({ id: a.id, slug: a.slug, label: a.label, type: a.artist_type, costMin: a.cost_min, costMax: a.cost_max })),
    meals:     (meals ?? []).map(m => ({ id: m.id, slug: m.slug, label: m.label, costMinPH: m.cost_min_ph, costMaxPH: m.cost_max_ph })),
    barTiers:  (barTiers ?? []).map(b => ({ id: b.id, slug: b.slug, label: b.label, costMinPH: b.cost_min_ph, costMaxPH: b.cost_max_ph })),
    specialtyCounters: (specialtyCounters ?? []).map(c => ({ id: c.id, slug: c.slug, label: c.label, costMin: c.cost_min, costMax: c.cost_max })),
    sfxItems:  (sfxItems ?? []).map(s => ({ id: s.id, slug: s.slug, label: s.label, cost: s.cost_fixed })),
    decor:     (decor ?? []).map(d => ({ id: d.id, label: d.label, function: d.function_type, style: d.style, complexity: d.complexity, costMin: d.cost_min, costMax: d.cost_max })),
    logistics: { vehiclePerHead: L.guests_per_vehicle ?? 3, vehicleRateMin: L.vehicle_rate_min ?? 4500, vehicleRateMax: L.vehicle_rate_max ?? 7000, ghodiMin: L.ghodi_min ?? 45000, ghodiMax: L.ghodi_max ?? 90000, dholiUnitMin: L.dholi_unit_min ?? 15000, dholiUnitMax: L.dholi_unit_max ?? 30000 },
    sundries:  { roomBasketMin: S.room_basket_min ?? 1800, roomBasketMax: S.room_basket_max ?? 3500, ritualPerFnMin: S.ritual_per_fn_min ?? 35000, ritualPerFnMax: S.ritual_per_fn_max ?? 75000, giftPerGuestMin: S.gift_per_guest_min ?? 500, giftPerGuestMax: S.gift_per_guest_max ?? 1500, stationeryPerGuestMin: S.stationery_per_guest_min ?? 200, stationeryPerGuestMax: S.stationery_per_guest_max ?? 500, photographyMin: S.photography_min ?? 180000, photographyMax: S.photography_max ?? 550000, contingencyPct: S.contingency_pct ?? 0.05 },
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
      const cityMult     = refData.cities?.[req.body.city]?.mult ?? 1.0;
      const hotelMult    = refData.hotelTiers?.[req.body.hotelTier]?.decorMult ?? 1.0;
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
    const { city = 'hyderabad', hotelTier = 'star4', rooms = 50, guests = 200 } = req.body;
    const result  = calculateBudget({ city, hotelTier, rooms, guests, outstationPct: 50, functions: ['sangeet', 'pheras', 'reception'] }, refData);
    res.json({ summary: result.summary, meta: result.meta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;