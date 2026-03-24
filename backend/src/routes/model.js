// routes/model.js
const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { triggerTraining, getModelStatus, checkHealth } = require('../services/mlService');

const HF_SPACE_BASE = 'https://gamerquant-wedding-decor-price.hf.space';
const HF_RETRAIN_CALL = `${HF_SPACE_BASE}/gradio_api/call/trigger_retrain`;
const RETRAIN_SECRET_CONTENT_KEY = 'ml_retrain';

function parseSseEvents(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const events = [];
  let currentEvent = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      const dataRaw = line.slice('data:'.length).trim();
      let parsed = dataRaw;
      try {
        parsed = JSON.parse(dataRaw);
      } catch {
        // keep raw string
      }
      events.push({ event: currentEvent || 'message', data: parsed, raw: dataRaw });
    }
  }

  return events;
}

function messageFromSseData(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  if (typeof data === 'string') return data;
  return null;
}

async function getRetrainSecretFromDb() {
  const { data, error } = await supabaseAdmin
    .from('website_content')
    .select('content')
    .eq('content_key', RETRAIN_SECRET_CONTENT_KEY)
    .single();

  if (error) {
    throw new Error('Retrain secret is not configured in database.');
  }

  const content = data?.content ?? {};
  const secret = String(content?.secret || content?.retrainSecret || '').trim();
  if (!secret) {
    throw new Error('Retrain secret is empty in database.');
  }

  return secret;
}

// GET /api/model/status
router.get('/status', requireAdmin, async (req, res) => {
  const [mlHealth, { data: versions }] = await Promise.all([
    checkHealth(),
    supabaseAdmin.from('model_versions')
      .select('id, version_label, status, training_set_size, accuracy, precision, recall, f1_score, trained_at, is_active')
      .order('trained_at', { ascending: false }).limit(10),
  ]);
  res.json({ versions: versions ?? [], mlHealth });
});

// POST /api/model/train
router.post('/train', requireAdmin, async (req, res) => {
  const { versionLabel, forceBestModel, forceAlgorithm, includeScrapedDirect } = req.body;
  if (!versionLabel?.trim()) return res.status(400).json({ error: 'versionLabel is required.' });
  if (forceBestModel !== undefined && typeof forceBestModel !== 'boolean') {
    return res.status(400).json({ error: 'forceBestModel must be a boolean when provided.' });
  }
  if (forceAlgorithm !== undefined && typeof forceAlgorithm !== 'string') {
    return res.status(400).json({ error: 'forceAlgorithm must be a string when provided.' });
  }
  if (includeScrapedDirect !== undefined && typeof includeScrapedDirect !== 'boolean') {
    return res.status(400).json({ error: 'includeScrapedDirect must be a boolean when provided.' });
  }

  try {
    const data = await triggerTraining(
      versionLabel.trim(),
      req.profile.id,
      forceBestModel ?? null,
      forceAlgorithm?.trim()?.toLowerCase() || null,
      includeScrapedDirect ?? false,
    );
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

  // Deactivate all other active versions first.
  const { error: deactivateErr } = await supabaseAdmin.from('model_versions').update({ is_active: false }).eq('is_active', true);
  if (deactivateErr) return res.status(500).json({ error: deactivateErr.message });

  // Promote
  const { data, error: promoteErr } = await supabaseAdmin
    .from('model_versions').update({ is_active: true }).eq('id', req.params.id).select().single();
  if (promoteErr) return res.status(500).json({ error: promoteErr.message });

  const { data: versions, error: listErr } = await supabaseAdmin
    .from('model_versions')
    .select('id, version_label, status, training_set_size, accuracy, precision, recall, f1_score, trained_at, is_active')
    .order('trained_at', { ascending: false })
    .limit(10);
  if (listErr) return res.status(500).json({ error: listErr.message });

  res.json({ version: data, versions: versions ?? [], message: `Version ${data.version_label} is now active.` });
});

// GET /api/model/run/:id — training run log
router.get('/run/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('training_runs').select('*').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'Run not found.' });
  res.json(data);
});

// POST /api/model/retrain/start
// Starts HF queued retrain using a secret loaded from database.
router.post('/retrain/start', requireAdmin, async (req, res) => {
  try {
    const retrainSecret = await getRetrainSecretFromDb();

    const startRes = await fetch(HF_RETRAIN_CALL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [retrainSecret] }),
    });

    const body = await startRes.json().catch(() => ({}));
    if (!startRes.ok) {
      return res.status(startRes.status).json({
        error: body?.error || body?.detail || `Retrain start failed (${startRes.status})`,
      });
    }

    if (!body?.event_id) {
      return res.status(502).json({ error: 'HF retrain start returned no event_id.' });
    }

    res.json({ eventId: body.event_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/model/retrain/poll/:eventId
// Polls HF queued retrain status and returns the latest SSE event message.
router.get('/retrain/poll/:eventId', requireAdmin, async (req, res) => {
  try {
    const eventId = String(req.params.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required.' });
    }

    const pollRes = await fetch(`${HF_RETRAIN_CALL}/${encodeURIComponent(eventId)}`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
    });

    const rawText = await pollRes.text();
    if (!pollRes.ok) {
      return res.status(pollRes.status).json({ error: `Retrain poll failed (${pollRes.status})` });
    }

    const events = parseSseEvents(rawText);
    const latest = events.length ? events[events.length - 1] : null;

    if (!latest) {
      return res.json({ complete: false, event: null, message: null });
    }

    const message = messageFromSseData(latest.data);
    const complete = latest.event === 'complete';

    res.json({
      complete,
      event: latest.event,
      message,
      isNullResult: complete && message == null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
