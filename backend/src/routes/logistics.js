// routes/logistics.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

router.get('/rates', async (req, res) => {
  const { data, error } = await supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ rates: data?.[0] ?? null });
});

router.get('/sfx', async (req, res) => {
  const { data, error } = await supabase.from('sfx_items').select('*').eq('is_active', true);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sfxItems: data ?? [] });
});

router.post('/estimate', async (req, res) => {
  const { outstationGuests = 0, ghodi = true, dholis = 2, sfxIds = [], city = 'hyderabad' } = req.body;
  const [{ data: lr }, { data: cityRow }, { data: sfxItems }] = await Promise.all([
    supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
    supabase.from('cities').select('multiplier').eq('slug', city).single(),
    sfxIds.length ? supabase.from('sfx_items').select('*').in('id', sfxIds) : { data: [] },
  ]);

  const L = lr?.[0];
  const cm = Number(cityRow?.multiplier);
  if (!L || !Number.isFinite(cm)) {
    return res.status(400).json({ error: 'Missing DB-backed logistics or city multiplier config.' });
  }

  const guestsPerVehicle = Number(L.guests_per_vehicle);
  const vehicleRateMin = Number(L.vehicle_rate_min);
  const vehicleRateMax = Number(L.vehicle_rate_max);
  const ghodiMin = Number(L.ghodi_min);
  const ghodiMax = Number(L.ghodi_max);
  const dholiUnitMin = Number(L.dholi_unit_min);
  const dholiUnitMax = Number(L.dholi_unit_max);
  if (![guestsPerVehicle, vehicleRateMin, vehicleRateMax, ghodiMin, ghodiMax, dholiUnitMin, dholiUnitMax].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Incomplete DB-backed logistics rates.' });
  }

  const vehicles = Math.ceil(outstationGuests / guestsPerVehicle);
  let lMin = vehicles * vehicleRateMin * 2;
  let lMax = vehicles * vehicleRateMax * 2;
  if (ghodi) { lMin += ghodiMin * cm; lMax += ghodiMax * cm; }
  lMin += dholis * dholiUnitMin * cm;
  lMax += dholis * dholiUnitMax * cm;
  (sfxItems ?? []).forEach(s => { lMin += s.cost_fixed * 0.9; lMax += s.cost_fixed * 1.3; });

  res.json({ lMin: Math.round(lMin), lMax: Math.round(lMax), lMid: Math.round((lMin + lMax) / 2), vehicles });
});

module.exports = router;