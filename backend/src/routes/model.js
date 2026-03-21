// routes/model.js
const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { triggerTraining, getModelStatus, checkHealth } = require('../services/mlService');

// GET /api/model/status
router.get('/status', requireAdmin, async (req, res) => {
  const [mlHealth, { data: versions }] = await Promise.all([
    checkHealth(),
    supabaseAdmin.from('model_versions')
      .select('id, version_label, status, training_set_size, mae_min, mae_max, r2_min, r2_max, trained_at, is_active')
      .order('trained_at', { ascending: false }).limit(10),
  ]);
  res.json({ versions: versions ?? [], mlHealth });
});

// POST /api/model/train
router.post('/train', requireAdmin, async (req, res) => {
  const { versionLabel, forceBestModel, forceAlgorithm } = req.body;
  if (!versionLabel?.trim()) return res.status(400).json({ error: 'versionLabel is required.' });
  if (forceBestModel !== undefined && typeof forceBestModel !== 'boolean') {
    return res.status(400).json({ error: 'forceBestModel must be a boolean when provided.' });
  }
  if (forceAlgorithm !== undefined && typeof forceAlgorithm !== 'string') {
    return res.status(400).json({ error: 'forceAlgorithm must be a string when provided.' });
  }

  try {
    const data = await triggerTraining(versionLabel.trim(), req.profile.id, forceBestModel ?? null, forceAlgorithm?.trim()?.toLowerCase() || null);
    if (data === null) return res.status(503).json({ error: 'ML service is unavailable. Start the ml_service and try again.' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: `ML service error: ${err.message}` });
  }
});

// POST /api/model/promote/:id — manually promote a ready version to active
router.post('/promote/:id', requireAdmin, async (req, res) => {
  const { data: version } = await supabaseAdmin
    .from('model_versions').select('id, status').eq('id', req.params.id).single();

  if (!version) return res.status(404).json({ error: 'Version not found.' });
  if (version.status !== 'ready') return res.status(400).json({ error: 'Can only promote ready versions.' });

  // Deactivate current active
  const { error: deactivateErr } = await supabaseAdmin.from('model_versions').update({ is_active: false }).eq('is_active', true);
  if (deactivateErr) return res.status(500).json({ error: deactivateErr.message });

  // Promote
  const { data, error: promoteErr } = await supabaseAdmin
    .from('model_versions').update({ is_active: true }).eq('id', req.params.id).select().single();
  if (promoteErr) return res.status(500).json({ error: promoteErr.message });

  res.json({ version: data, message: `Version ${data.version_label} is now active.` });
});

// GET /api/model/run/:id — training run log
router.get('/run/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('training_runs').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Run not found.' });
  res.json(data);
});

module.exports = router;
