// routes/artists.js
const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabaseClient');

router.get('/', async (req, res) => {
  let query = supabase.from('artists').select('*').eq('is_active', true).order('artist_type');
  if (req.query.type) query = query.eq('artist_type', req.query.type);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ artists: data ?? [] });
});

module.exports = router;