// routes/model.js
const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { triggerTraining, getModelStatus, checkHealth } = require('../services/mlService');

const HF_SPACE_BASE = 'https://gamerquant-wedding-decor-price.hf.space';
const HF_RETRAIN_CALL = `${HF_SPACE_BASE}/gradio_api/call/trigger_retrain`;
const RETRAIN_SECRET_CONTENT_KEY = 'ml_retrain';
const MODEL_BUCKET = 'ml-models';

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

function parsePercentOrRatio(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  const isPercent = text.endsWith('%');
  const n = Number.parseFloat(text.replace('%', ''));
  if (!Number.isFinite(n)) return null;
  if (isPercent || n > 1) return Math.max(0, Math.min(1, n / 100));
  return Math.max(0, Math.min(1, n));
}

function isMissingSchemaColumnError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('schema cache') && msg.includes('could not find') && msg.includes('column');
}

function parseMetricsFromMessage(message) {
  const text = String(message || '');
  const capture = (pattern) => text.match(pattern)?.[1] ?? null;

  return {
    accuracy: parsePercentOrRatio(capture(/(?:\bacc(?:uracy)?\b)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?%?)/i)),
    precision: parsePercentOrRatio(capture(/\bprecision\b\s*[:=]\s*([0-9]+(?:\.[0-9]+)?%?)/i)),
    recall: parsePercentOrRatio(capture(/\brecall\b\s*[:=]\s*([0-9]+(?:\.[0-9]+)?%?)/i)),
    f1_score: parsePercentOrRatio(capture(/\bf1\b\s*[:=]\s*([0-9]+(?:\.[0-9]+)?%?)/i)),
  };
}

function toFiniteRatio(raw) {
  const parsed = parsePercentOrRatio(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumSupport(support) {
  if (support == null) return null;
  if (Number.isFinite(Number(support))) return Number(support);
  if (typeof support === 'object') {
    const vals = Object.values(support).map((v) => Number(v)).filter((n) => Number.isFinite(n));
    if (!vals.length) return null;
    return vals.reduce((s, n) => s + n, 0);
  }
  return null;
}

async function downloadMetricsSidecar(versionTag) {
  const path = `versions/${versionTag}/metrics.json`;
  const { data, error } = await supabaseAdmin.storage.from(MODEL_BUCKET).download(path);
  if (error || !data) return null;

  try {
    // Supabase returns Blob in Node fetch runtimes.
    const text = typeof data.text === 'function'
      ? await data.text()
      : Buffer.from(await data.arrayBuffer()).toString('utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeMetrics(sidecarMetrics = null, fallbackMetrics = {}) {
  const metrics = sidecarMetrics || {};
  const accuracy = toFiniteRatio(metrics.accuracy ?? fallbackMetrics.accuracy);
  const precision = toFiniteRatio(metrics.precision ?? fallbackMetrics.precision);
  const recall = toFiniteRatio(metrics.recall ?? fallbackMetrics.recall);
  const f1Score = toFiniteRatio(metrics.f1 ?? metrics.f1_score ?? fallbackMetrics.f1_score);
  const support = metrics.support ?? null;

  return {
    accuracy,
    precision,
    recall,
    f1_score: f1Score,
    support,
    test_set_size: sumSupport(support),
  };
}

function parseVersionTagToIsoUtc(tag) {
  const m = String(tag || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))).toISOString();
}

async function getLatestVersionTagFromStorage() {
  const versionPattern = /^\d{8}_\d{6}$/;

  const { data: versionFolders, error } = await supabaseAdmin.storage
    .from(MODEL_BUCKET)
    .list('versions', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });

  if (error) throw new Error(`Failed to list model versions in storage: ${error.message}`);

  const candidates = (versionFolders ?? [])
    .map((entry) => entry?.name)
    .filter((name) => versionPattern.test(String(name || '')))
    .sort((a, b) => String(b).localeCompare(String(a)));

  if (!candidates.length) return null;
  return candidates[0];
}

async function upsertModelVersionFromStorage({ metrics = {}, trainedBy = null, notes = null }) {
  const versionTag = await getLatestVersionTagFromStorage();
  if (!versionTag) return null;

  const modelPath = `versions/${versionTag}/model.joblib`;
  const trainedAt = parseVersionTagToIsoUtc(versionTag);
  const sidecarMetrics = await downloadMetricsSidecar(versionTag);
  const normalizedMetrics = normalizeMetrics(sidecarMetrics, metrics);

  // Ensure the folder has the core artifacts before writing DB state.
  const { data: artifacts, error: listErr } = await supabaseAdmin.storage
    .from(MODEL_BUCKET)
    .list(`versions/${versionTag}`, { limit: 100 });
  if (listErr) throw new Error(`Failed to verify model artifacts: ${listErr.message}`);

  const names = new Set((artifacts ?? []).map((a) => a?.name));
  if (!names.has('model.joblib') || !names.has('transforms.joblib') || !names.has('label_encoder.joblib')) {
    throw new Error(`Model artifacts incomplete for version ${versionTag}.`);
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('model_versions')
    .select('id')
    .eq('version_label', versionTag)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  const metricsBlob = {
    accuracy: normalizedMetrics.accuracy,
    precision: normalizedMetrics.precision,
    recall: normalizedMetrics.recall,
    f1: normalizedMetrics.f1_score,
    support: normalizedMetrics.support,
    version_tag: versionTag,
    created_at: trainedAt,
  };

  const payload = {
    version_label: versionTag,
    status: 'ready',
    model_file_path: modelPath,
    trained_at: trainedAt,
    notes: notes || `metrics_sidecar=${JSON.stringify(metricsBlob)}`,
  };

  if (trainedBy) payload.trained_by = trainedBy;
  if (normalizedMetrics.accuracy != null) payload.accuracy = normalizedMetrics.accuracy;
  if (normalizedMetrics.precision != null) payload.precision = normalizedMetrics.precision;
  if (normalizedMetrics.recall != null) payload.recall = normalizedMetrics.recall;
  if (normalizedMetrics.f1_score != null) payload.f1_score = normalizedMetrics.f1_score;
  if (normalizedMetrics.test_set_size != null) payload.test_set_size = normalizedMetrics.test_set_size;

  async function writePayload(writePayloadData) {
    if (existing?.id) {
      const { error: updateErr } = await supabaseAdmin
        .from('model_versions')
        .update(writePayloadData)
        .eq('id', existing.id);
      if (updateErr) return { ok: false, error: updateErr };
      return { ok: true };
    }

    const { error: insertErr } = await supabaseAdmin
      .from('model_versions')
      .insert(writePayloadData);
    if (insertErr) return { ok: false, error: insertErr };
    return { ok: true };
  }

  let writeResult = await writePayload(payload);
  if (!writeResult.ok && isMissingSchemaColumnError(writeResult.error)) {
    const fallbackPayload = {
      version_label: versionTag,
      status: 'ready',
      model_file_path: modelPath,
      trained_at: trainedAt,
      notes: notes || `metrics_sidecar=${JSON.stringify(metricsBlob)}`,
    };
    if (trainedBy) fallbackPayload.trained_by = trainedBy;

    writeResult = await writePayload(fallbackPayload);
  }

  if (!writeResult.ok) throw new Error(writeResult.error.message);

  // Make this version active (single-active invariant).
  const { error: deactivateErr } = await supabaseAdmin
    .from('model_versions')
    .update({ is_active: false })
    .neq('version_label', versionTag)
    .eq('is_active', true);
  if (deactivateErr) throw new Error(deactivateErr.message);

  const { error: activateErr } = await supabaseAdmin
    .from('model_versions')
    .update({ is_active: true })
    .eq('version_label', versionTag);
  if (activateErr) throw new Error(activateErr.message);

  return versionTag;
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

    let syncedVersionLabel = null;
    if (complete && message != null) {
      const msgText = String(message);
      const looksSuccessful = !/\b(retrain failed|\bduplicate\b|error|exception|traceback|\b❌\b)\b/i.test(msgText);
      if (looksSuccessful) {
        try {
          syncedVersionLabel = await upsertModelVersionFromStorage({
            metrics: parseMetricsFromMessage(msgText),
            trainedBy: req.profile?.id ?? null,
            notes: 'Synced from HF retrain completion event.',
          });
        } catch (syncErr) {
          return res.status(500).json({ error: `Retrain finished but DB sync failed: ${syncErr.message}` });
        }
      }
    }

    res.json({
      complete,
      event: latest.event,
      message,
      isNullResult: complete && message == null,
      syncedVersionLabel,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
