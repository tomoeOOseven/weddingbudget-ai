// routes/fb.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

router.get('/meals', async (req, res) => {
  const { data } = await supabase.from('meals').select('*').eq('is_active', true);
  res.json({ meals: data ?? [] });
});

router.get('/bar-tiers', async (req, res) => {
  const { data } = await supabase.from('bar_tiers').select('*').eq('is_active', true);
  res.json({ barTiers: data ?? [] });
});

router.get('/specialty-counters', async (req, res) => {
  const { data } = await supabase.from('specialty_counters').select('*').eq('is_active', true);
  res.json({ counters: data ?? [] });
});

router.post('/estimate', async (req, res) => {
  const { guestCount, mealIds = [], barTierId, counterIds = [], city = 'hyderabad' } = req.body;
  const { data: cityRow } = await supabase.from('cities').select('multiplier').eq('slug', city).single();
  const cm = cityRow?.multiplier ?? 1.0;

  const [{ data: meals }, { data: bar }, { data: counters }] = await Promise.all([
    supabase.from('meals').select('*').in('id', mealIds.length ? mealIds : ['__none__']),
    barTierId ? supabase.from('bar_tiers').select('*').eq('id', barTierId).single() : { data: null },
    supabase.from('specialty_counters').select('*').in('id', counterIds.length ? counterIds : ['__none__']),
  ]);

  let fbMin = 0, fbMax = 0;
  (meals ?? []).forEach(m => { fbMin += m.cost_min_ph * guestCount * cm; fbMax += m.cost_max_ph * guestCount * cm; });
  if (bar) { fbMin += bar.cost_min_ph * guestCount * cm; fbMax += bar.cost_max_ph * guestCount * cm; }
  (counters ?? []).forEach(c => { fbMin += c.cost_min * cm; fbMax += c.cost_max * cm; });

  res.json({ fbMin: Math.round(fbMin), fbMax: Math.round(fbMax), fbMid: Math.round((fbMin + fbMax) / 2) });
});

module.exports = router;