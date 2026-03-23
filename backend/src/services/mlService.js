// services/mlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin HTTP client for the Python ML microservice.
// All calls go through here — if the ML service is down, falls back gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const ML_URL = String(process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const ML_PIPELINE_ENABLED = String(process.env.ML_PIPELINE_ENABLED || '').toLowerCase() === 'true'
  || process.env.ML_PIPELINE_ENABLED === '1';
const TIMEOUT = 30000;
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

function trimTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeHealth(baseUrl, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data } = await axios.get(`${baseUrl}/health`, { timeout: 15000 });
      return { ok: true, data };
    } catch (err) {
      lastError = err;
      const code = err?.response?.status;
      const isTransient = TRANSIENT_STATUS_CODES.has(code);
      if (!isTransient || attempt === attempts) break;
      await sleep(600 * attempt);
    }
  }

  return {
    ok: false,
    error: lastError,
    statusCode: lastError?.response?.status ?? null,
    transient: TRANSIENT_STATUS_CODES.has(lastError?.response?.status),
  };
}

/**
 * Predict cost range for a decor item.
 * @param {object} params
 * @param {string} params.imageId        — scraped_images UUID (for embedding lookup)
 * @param {string} params.imageUrl       — fallback if no stored embedding
 * @param {string} params.storagePath    — Supabase Storage path
 * @param {string} params.functionType   — wedding_function enum
 * @param {string} params.style          — decor_style enum
 * @param {string} params.complexity     — complexity_tier enum
 * @param {number} params.cityMult       — city multiplier (1.0 = Hyderabad baseline)
 * @param {number} params.hotelDecorMult — hotel tier decor multiplier
 * @returns {object} { cost_min, cost_max, cost_mid, confidence, source, version_id }
 */
async function predictCost(params) {
  if (!ML_PIPELINE_ENABLED) {
    return null;
  }

  try {
    const { data } = await axios.post(`${ML_URL}/predict`, {
      image_id:         params.imageId       ?? null,
      image_url:        params.imageUrl      ?? null,
      storage_path:     params.storagePath   ?? null,
      function_type:    params.functionType  ?? null,
      style:            params.style         ?? null,
      complexity:       params.complexity    ?? null,
      city_mult:        params.cityMult      ?? 1.0,
      hotel_decor_mult: params.hotelDecorMult ?? 1.0,
    }, { timeout: TIMEOUT });

    return data;

  } catch (err) {
    console.error('[mlService] predict failed:', err.message);
    // Return null — caller falls back to rule-based scoring
    return null;
  }
}

/**
 * Trigger background embedding generation for one image.
 * Fire-and-forget — does not wait for completion.
 */
async function embedImage(imageId, imageUrl, storagePath = null) {
  if (!ML_PIPELINE_ENABLED) {
    return false;
  }

  try {
    await axios.post(`${ML_URL}/embed`, {
      image_id:     imageId,
      image_url:    imageUrl,
      storage_path: storagePath,
    }, { timeout: TIMEOUT });
    return true;
  } catch (err) {
    console.error('[mlService] embed failed:', err.message);
    return false;
  }
}

/**
 * Trigger a training run.
 * @param {string} versionLabel  — e.g. "v1.2"
 * @param {string} triggeredBy   — admin profile UUID
 * @param {boolean|null} forceBestModel — promote best learned model even if it does not beat rule-based
 * @param {string|null} forceAlgorithm — force one algorithm name for this run
 */
async function triggerTraining(versionLabel, triggeredBy = null, forceBestModel = null, forceAlgorithm = null) {
  if (!ML_PIPELINE_ENABLED) {
    return null;
  }

  try {
    const { data } = await axios.post(`${ML_URL}/train`, {
      version_label: versionLabel,
      triggered_by:  triggeredBy,
      force_best_model: forceBestModel,
      force_algorithm: forceAlgorithm,
    }, { timeout: 10000 });
    return data;
  } catch (err) {
    console.error('[mlService] triggerTraining failed:', err.message);
    return null;
  }
}

/**
 * Get active model status and recent version history.
 */
async function getModelStatus() {
  if (!ML_PIPELINE_ENABLED) {
    return null;
  }

  try {
    const { data } = await axios.get(`${ML_URL}/model/status`, { timeout: 5000 });
    return data;
  } catch {
    return null;
  }
}

/**
 * Health check — is the ML service running?
 */
async function checkHealth() {
  if (!ML_PIPELINE_ENABLED) {
    return {
      available: false,
      checked_url: null,
      disabled: true,
      error: 'ML pipeline disabled by ML_PIPELINE_ENABLED',
    };
  }

  const primary = trimTrailingSlash(ML_URL);
  const probe = await probeHealth(primary, 3);

  if (probe.ok) {
    return { available: true, checked_url: primary, ...probe.data };
  }

  const statusCode = probe?.statusCode ?? null;
  return {
    available: false,
    checked_url: primary,
    status_code: statusCode,
    warming_up: probe?.transient ?? false,
    error: probe?.error?.message || 'Health check failed',
  };
}

module.exports = { predictCost, embedImage, triggerTraining, getModelStatus, checkHealth };
