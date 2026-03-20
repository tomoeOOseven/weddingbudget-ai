// routes/weddings.js — client wedding management
const express = require('express');
const router  = express.Router();
const { requireAuth, supabaseAdmin } = require('../middleware/authMiddleware');

// GET /api/weddings — list client's weddings
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('weddings')
    .select(`*, cities ( label ), hotel_tiers ( label ), budget_estimates ( total_min, total_max, total_mid, is_current, generated_at )`)
    .eq('client_id', req.profile.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ weddings: data ?? [] });
});

// POST /api/weddings — create a new wedding
router.post('/', requireAuth, async (req, res) => {
  const { name, weddingDate, citySlug, hotelTierSlug, roomsBlocked, totalGuests, outstationPct, bridgeHometown, groomHometown, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });

  // Resolve city and hotel IDs from slugs
  const [{ data: city }, { data: hotel }] = await Promise.all([
    citySlug      ? supabaseAdmin.from('cities').select('id').eq('slug', citySlug).single() : { data: null },
    hotelTierSlug ? supabaseAdmin.from('hotel_tiers').select('id').eq('slug', hotelTierSlug).single() : { data: null },
  ]);

  const { data, error } = await supabaseAdmin.from('weddings').insert({
    client_id:      req.profile.id,
    name,
    wedding_date:   weddingDate ?? null,
    city_id:        city?.id ?? null,
    hotel_tier_id:  hotel?.id ?? null,
    rooms_blocked:  roomsBlocked ?? null,
    total_guests:   totalGuests ?? null,
    outstation_pct: outstationPct ?? 0,
    bride_hometown: bridgeHometown ?? null,
    groom_hometown: groomHometown ?? null,
    notes:          notes ?? null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ wedding: data });
});

// GET /api/weddings/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('weddings')
    .select(`*, cities(*), hotel_tiers(*), budget_estimates(*), scenarios(*)`)
    .eq('id', req.params.id)
    .eq('client_id', req.profile.id)
    .single();
  if (error) return res.status(404).json({ error: 'Wedding not found.' });
  res.json(data);
});

// PUT /api/weddings/:id
router.put('/:id', requireAuth, async (req, res) => {
  const allowed = ['name','wedding_date','rooms_blocked','total_guests','outstation_pct','bride_hometown','groom_hometown','notes','status'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('weddings').update(updates).eq('id', req.params.id).eq('client_id', req.profile.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ wedding: data });
});

module.exports = router;
