// routes/decor.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');
const { predictCost } = require('../services/mlService');

// GET /api/decor — list all decor (seed + scraped)
router.get('/', async (req, res) => {
  let query = supabase.from('decor_items').select('*').eq('is_active', true).order('function_type');
  if (req.query.function) query = query.eq('function_type', req.query.function);
  if (req.query.style)    query = query.eq('style', req.query.style);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: data?.length ?? 0, items: data ?? [] });
});

// GET /api/decor/scraped — labelled scraped images
router.get('/scraped', async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  let query = supabase
    .from('scraped_images')
    .select(`id, title, storage_path, image_url, price_inr, price_range_tag, image_labels ( function_type, style, complexity, cost_seed_min, cost_seed_max )`, { count: 'exact' })
    .eq('status', 'labelled')
    .not('price_range_tag', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (req.query.function) {
    query = query.eq('image_labels.function_type', req.query.function);
  }
  if (req.query.priceRangeTag) {
    query = query.eq('price_range_tag', req.query.priceRangeTag);
  }
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const SURL = process.env.SUPABASE_URL;
  const images = (data ?? []).filter(img => img.image_labels?.length > 0).map(img => ({
    id: img.id, label: img.title ?? 'Scraped Design',
    ...img.image_labels[0],
    priceInr: img.price_inr,
    priceRangeTag: img.price_range_tag,
    publicUrl: img.storage_path ? `${SURL}/storage/v1/object/public/decor-images/${img.storage_path}` : img.image_url,
  }));
  res.json({ count, images, offset, limit });
});

// POST /api/decor/score — AI cost prediction using ML service
router.post('/score', async (req, res) => {
  const { selections = [], city = 'hyderabad', hotelTier = 'star4' } = req.body;
  const { data: cityRow }  = await supabase.from('cities').select('multiplier').eq('slug', city).single();
  const { data: hotelRow } = await supabase.from('hotel_tiers').select('decor_mult').eq('slug', hotelTier).single();
  const cityMult = Number(cityRow?.multiplier);
  const hotelDecorMult = Number(hotelRow?.decor_mult);
  if (!Number.isFinite(cityMult) || !Number.isFinite(hotelDecorMult)) {
    return res.status(400).json({ error: 'Missing DB-backed city/hotel multiplier config for scoring.' });
  }

  const scored = await Promise.all(
    selections.map(async sel => {
      const ml = await predictCost({
        imageId: sel.decorId, functionType: sel.function, style: sel.style,
        complexity: sel.complexity, cityMult, hotelDecorMult,
      });
      if (ml) return { decorId: sel.decorId, label: sel.label, ...ml };
      // Rule-based fallback
      if (!Number.isFinite(Number(sel.costMin)) || !Number.isFinite(Number(sel.costMax))) {
        throw new Error(`Missing DB-backed cost seed for decor selection: ${sel.decorId || sel.label || 'unknown'}`);
      }
      return {
        decorId:   sel.decorId,
        label:     sel.label,
        cost_min:  Math.round(Number(sel.costMin) * cityMult * hotelDecorMult * 0.9),
        cost_max:  Math.round(Number(sel.costMax) * cityMult * hotelDecorMult * 1.1),
        confidence: 0.45,
        source:    'rule_based',
      };
    })
  );

  res.json({ scored, cityMultiplier: cityMult, decorMultiplier: hotelDecorMult });
});

module.exports = router;