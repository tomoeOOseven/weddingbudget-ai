// routes/admin.js — cost data management with full audit trail
const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { getHomepageContent, saveHomepageContent } = require('../lib/siteContentStore');

// ── Generic versioned update helper ──────────────────────────────────────────
async function updateCostRow(table, id, updates, adminId) {
  const allowed = Object.keys(updates).filter(k => !['id','version','created_at'].includes(k));
  const payload = {};
  allowed.forEach(k => { payload[k] = updates[k]; });
  payload.updated_by = adminId;
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from(table)
    .update(payload).eq('id', id).select().single();
  return { data, error };
}

// ── CITIES ────────────────────────────────────────────────────────────────────
router.get('/cities', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('cities').select('*').order('label');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ cities: data });
});

router.put('/cities/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('cities', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ city: data, message: 'City updated.' });
});

// ── HOTEL TIERS ───────────────────────────────────────────────────────────────
router.get('/hotels', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('hotel_tiers').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tiers: data });
});

router.put('/hotels/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('hotel_tiers', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ tier: data, message: 'Hotel tier updated.' });
});

// ── ARTISTS ───────────────────────────────────────────────────────────────────
router.get('/artists', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('artists').select('*').order('artist_type');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ artists: data });
});

router.post('/artists', requireAdmin, async (req, res) => {
  const { label, artist_type, cost_min, cost_max, is_named = false, notes } = req.body;
  if (!label || !artist_type || !cost_min || !cost_max) return res.status(400).json({ error: 'label, artist_type, cost_min, cost_max required.' });
  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
  const { data, error } = await supabaseAdmin.from('artists').insert({ slug, label, artist_type, cost_min, cost_max, is_named, notes, updated_by: req.profile.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ artist: data });
});

router.put('/artists/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('artists', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ artist: data, message: 'Artist updated.' });
});

router.delete('/artists/:id', requireAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('artists').update({ is_active: false, updated_by: req.profile.id }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Artist deactivated.' });
});

// ── MEALS ─────────────────────────────────────────────────────────────────────
router.get('/meals', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('meals').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ meals: data ?? [] });
});
router.put('/meals/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('meals', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ meal: data });
});

// ── BAR TIERS ─────────────────────────────────────────────────────────────────
router.get('/bar-tiers', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('bar_tiers').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ barTiers: data ?? [] });
});
router.put('/bar-tiers/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('bar_tiers', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ barTier: data });
});

// ── SPECIALTY COUNTERS ────────────────────────────────────────────────────────
router.get('/specialty-counters', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('specialty_counters').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ counters: data ?? [] });
});
router.put('/specialty-counters/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('specialty_counters', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ counter: data });
});

// ── LOGISTICS ─────────────────────────────────────────────────────────────────
router.get('/logistics', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('logistics_rates').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logistics: data?.[0] ?? null });
});
router.put('/logistics/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('logistics_rates', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logistics: data });
});

// ── SFX ───────────────────────────────────────────────────────────────────────
router.get('/sfx', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('sfx_items').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sfx: data ?? [] });
});
router.put('/sfx/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('sfx_items', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

// ── SUNDRIES ──────────────────────────────────────────────────────────────────
router.get('/sundries', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('sundries_config').select('*').eq('is_active', true).order('version', { ascending: false }).limit(1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sundries: data?.[0] ?? null });
});
router.put('/sundries/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('sundries_config', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ sundries: data });
});

// ── DECOR ITEMS ───────────────────────────────────────────────────────────────
router.get('/decor', requireAdmin, async (req, res) => {
  const { data } = await supabaseAdmin.from('decor_items').select('*').order('function_type');
  res.json({ items: data ?? [], total: data?.length ?? 0 });
});
router.post('/decor', requireAdmin, async (req, res) => {
  const { label, function_type, style, complexity, cost_min, cost_max } = req.body;
  if (!label || !function_type || !style || !complexity) return res.status(400).json({ error: 'label, function_type, style, complexity required.' });
  const slug = label.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
  const { data, error } = await supabaseAdmin.from('decor_items').insert({ slug, label, function_type, style, complexity, cost_min: cost_min ?? 0, cost_max: cost_max ?? 0, updated_by: req.profile.id }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ item: data });
});
router.put('/decor/:id', requireAdmin, async (req, res) => {
  const { data, error } = await updateCostRow('decor_items', req.params.id, req.body, req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ item: data });
});

// ── AUDIT LOG ─────────────────────────────────────────────────────────────────
router.get('/audit', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  let query = supabaseAdmin.from('audit_log')
    .select('*, profiles!changed_by ( full_name, email )', { count: 'exact' })
    .order('changed_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (req.query.table) query = query.eq('table_name', req.query.table);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ log: data ?? [], total: count, offset, limit });
});

// ── WEBSITE CONTENT (homepage cards + games) ───────────────────────────────
router.get('/website-content', requireAdmin, async (req, res) => {
  try {
    const content = await getHomepageContent();
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/website-content', requireAdmin, async (req, res) => {
  try {
    const content = await saveHomepageContent(req.body, req.profile.id);
    res.json({ content, message: 'Website content updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;