// services/mlService.js
// ─────────────────────────────────────────────────────────────────────────────
// Thin HTTP client for the Python ML microservice.
// All calls go through here — if the ML service is down, falls back gracefully.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const ML_URL  = process.env.ML_SERVICE_URL ?? 'http://localhost:8000';
const TIMEOUT = 30000;

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
 */
async function triggerTraining(versionLabel, triggeredBy = null) {
  try {
    const { data } = await axios.post(`${ML_URL}/train`, {
      version_label: versionLabel,
      triggered_by:  triggeredBy,
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
  try {
    const { data } = await axios.get(`${ML_URL}/health`, { timeout: 3000 });
    return { available: true, ...data };
  } catch {
    return { available: false };
  }
}

module.exports = { predictCost, embedImage, triggerTraining, getModelStatus, checkHealth };
