// routes/weddings.js — client wedding management
const express = require('express');
const router  = express.Router();
const { requireClient, supabaseAdmin } = require('../middleware/authMiddleware');

function parseUuidArray(values) {
  if (!Array.isArray(values)) return [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return values.filter(v => typeof v === 'string' && uuidRe.test(v));
}

function parseTextArray(values) {
  if (!Array.isArray(values)) return [];
  return values.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean);
}

// GET /api/weddings — list client's weddings
router.get('/', requireClient, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('weddings')
    .select(`*, cities ( label ), hotel_tiers ( label ), budget_estimates ( total_min, total_max, total_mid, is_current, generated_at )`)
    .eq('client_id', req.profile.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ weddings: data ?? [] });
});

// POST /api/weddings — create a new wedding
router.post('/', requireClient, async (req, res) => {

  const { name, weddingDate, citySlug, hotelTierSlug, roomsBlocked, totalGuests, outstationPct, brideHometown, groomHometown, notes } = req.body;
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
    bride_hometown: brideHometown ?? null,
    groom_hometown: groomHometown ?? null,
    notes:          notes ?? null,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ wedding: data });
});

// GET /api/weddings/:id/state — secure wizard state, client only
router.get('/:id/state', requireClient, async (req, res) => {
  const { data: wedding, error: weddingErr } = await supabaseAdmin
    .from('weddings')
    .select('id')
    .eq('id', req.params.id)
    .eq('client_id', req.profile.id)
    .maybeSingle();

  if (weddingErr) return res.status(500).json({ error: weddingErr.message });
  if (!wedding) return res.status(404).json({ error: 'Wedding not found.' });

  const { data, error } = await supabaseAdmin
    .from('wedding_wizard_state')
    .select('*')
    .eq('wedding_id', req.params.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ state: data ?? null });
});

// PUT /api/weddings/:id/state — secure wizard state upsert, client only
router.put('/:id/state', requireClient, async (req, res) => {
  const { data: wedding, error: weddingErr } = await supabaseAdmin
    .from('weddings')
    .select('id')
    .eq('id', req.params.id)
    .eq('client_id', req.profile.id)
    .maybeSingle();

  if (weddingErr) return res.status(500).json({ error: weddingErr.message });
  if (!wedding) return res.status(404).json({ error: 'Wedding not found.' });

  const payload = {
    wedding_id: req.params.id,
    step: Math.max(1, Math.min(7, Number(req.body.step) || 1)),
    city_slug: typeof req.body.city === 'string' ? req.body.city : null,
    hotel_tier_slug: typeof req.body.hotelTier === 'string' ? req.body.hotelTier : null,
    rooms_blocked: Number.isFinite(Number(req.body.rooms)) ? Number(req.body.rooms) : null,
    total_guests: Number.isFinite(Number(req.body.guests)) ? Number(req.body.guests) : null,
    outstation_pct: Number.isFinite(Number(req.body.outstationPct)) ? Number(req.body.outstationPct) : null,
    function_ids: parseTextArray(req.body.functions),
    selected_decor_ids: parseUuidArray(req.body.selectedDecors),
    selected_artist_ids: parseUuidArray(req.body.selectedArtists),
    selected_meal_ids: parseTextArray(req.body.selectedMeals),
    bar_tier_slug: typeof req.body.barTier === 'string' ? req.body.barTier : null,
    specialty_counter_ids: parseTextArray(req.body.specialtyCounters),
    transfers: typeof req.body.transfers === 'boolean' ? req.body.transfers : null,
    ghodi: typeof req.body.ghodi === 'boolean' ? req.body.ghodi : null,
    dholis: Number.isFinite(Number(req.body.dholis)) ? Number(req.body.dholis) : null,
    sfx_ids: parseTextArray(req.body.sfx),
    room_baskets: typeof req.body.roomBaskets === 'boolean' ? req.body.roomBaskets : null,
    rituals: typeof req.body.rituals === 'boolean' ? req.body.rituals : null,
    gifts: typeof req.body.gifts === 'boolean' ? req.body.gifts : null,
    stationery: typeof req.body.stationery === 'boolean' ? req.body.stationery : null,
    photography: typeof req.body.photography === 'boolean' ? req.body.photography : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('wedding_wizard_state')
    .upsert(payload, { onConflict: 'wedding_id' })
    .select('*')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ state: data });
});

// GET /api/weddings/:id
router.get('/:id', requireClient, async (req, res) => {
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
router.put('/:id', requireClient, async (req, res) => {
  const allowed = ['name','wedding_date','rooms_blocked','total_guests','outstation_pct','bride_hometown','groom_hometown','status'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('weddings').update(updates).eq('id', req.params.id).eq('client_id', req.profile.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ wedding: data });
});

// DELETE /api/weddings/:id
router.delete('/:id', requireClient, async (req, res) => {
  const { error } = await supabaseAdmin
    .from('weddings')
    .delete()
    .eq('id', req.params.id)
    .eq('client_id', req.profile.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Wedding deleted.' });
});

module.exports = router;
