// routes/logistics.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

router.get('/rates', async (req, res) => {
  const { data } = await supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  res.json({ rates: data?.[0] ?? null });
});

router.get('/sfx', async (req, res) => {
  const { data } = await supabase.from('sfx_items').select('*').eq('is_active', true);
  res.json({ sfxItems: data ?? [] });
});

router.post('/estimate', async (req, res) => {
  const { outstationGuests = 0, ghodi = true, dholis = 2, sfxIds = [], city = 'hyderabad' } = req.body;
  const [{ data: lr }, { data: cityRow }, { data: sfxItems }] = await Promise.all([
    supabase.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1),
    supabase.from('cities').select('multiplier').eq('slug', city).single(),
    sfxIds.length ? supabase.from('sfx_items').select('*').in('id', sfxIds) : { data: [] },
  ]);

  const L  = lr?.[0] ?? {};
  const cm = cityRow?.multiplier ?? 1.0;
  const vehicles = Math.ceil(outstationGuests / (L.guests_per_vehicle ?? 3));
  let lMin = vehicles * (L.vehicle_rate_min ?? 4500) * 2;
  let lMax = vehicles * (L.vehicle_rate_max ?? 7000) * 2;
  if (ghodi) { lMin += (L.ghodi_min ?? 45000) * cm; lMax += (L.ghodi_max ?? 90000) * cm; }
  lMin += dholis * (L.dholi_unit_min ?? 15000) * cm;
  lMax += dholis * (L.dholi_unit_max ?? 30000) * cm;
  (sfxItems ?? []).forEach(s => { lMin += s.cost_fixed * 0.9; lMax += s.cost_fixed * 1.3; });

  res.json({ lMin: Math.round(lMin), lMax: Math.round(lMax), lMid: Math.round((lMin + lMax) / 2), vehicles });
});

module.exports = router;