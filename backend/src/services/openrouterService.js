// services/openrouterService.js
// ─────────────────────────────────────────────────────────────────────────────
// Sends a scraped decor image to a vision-capable model via OpenRouter.
// Returns structured tags: function_type, style, complexity, cost estimates.
//
// Primary model: claude-sonnet-4-20250514 (best image understanding)
// Fallback model: google/gemini-flash-1.5  (cheaper, fast)
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const PRIMARY_MODEL  = process.env.OPENROUTER_MODEL  ?? 'anthropic/claude-sonnet-4-20250514';
const FALLBACK_MODEL = 'google/gemini-flash-1.5';

// Valid enum values — must match the DB enums exactly
const VALID_FUNCTIONS   = ['haldi', 'mehendi', 'sangeet', 'baraat', 'pheras', 'reception', 'other'];
const VALID_STYLES      = ['Traditional', 'Boho', 'Modern', 'Contemporary', 'Romantic', 'Opulent', 'Rustic', 'Vintage'];
const VALID_COMPLEXITIES = ['low', 'medium', 'high', 'ultra'];

const SYSTEM_PROMPT = `You are an expert Indian wedding decorator and cost estimator with 15+ years of experience.
You will be shown an image of Indian wedding decor. Analyse it carefully and return ONLY a valid JSON object — no markdown, no explanation, no preamble.

Return exactly this structure:
{
  "function_type": one of: haldi | mehendi | sangeet | baraat | pheras | reception | other,
  "style": one of: Traditional | Boho | Modern | Contemporary | Romantic | Opulent | Rustic | Vintage,
  "complexity": one of: low | medium | high | ultra,
  "cost_seed_min": integer in INR (Indian Rupees) — realistic minimum cost for this decor setup,
  "cost_seed_max": integer in INR — realistic maximum cost for this decor setup,
  "confidence": float between 0.0 and 1.0 — how confident you are in this analysis,
  "reasoning": string — 1-2 sentences explaining your classification and cost estimate
}

Cost estimation guidelines (INR, 2024 Indian wedding market):
- low complexity (haldi/small mehendi): ₹50,000 – ₹2,00,000
- medium complexity (sangeet, standard mehendi): ₹1,50,000 – ₹6,00,000
- high complexity (grand reception, baraat): ₹4,00,000 – ₹15,00,000
- ultra complexity (palace reception, opulent mandap): ₹10,00,000 – ₹50,00,000

Consider: floral volume, fabric draping, lighting rigs, structural elements, prop density.
Opulent style adds 20-40% to cost. Traditional and Boho styles are typically lower cost.`;

/**
 * Get the public URL of an image from Supabase Storage.
 * Falls back to original scraped URL if no storage path.
 */
function getImageUrl(image) {
  if (image.storage_path) {
    const supabaseUrl = process.env.SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/decor-images/${image.storage_path}`;
  }
  return image.image_url;
}

/**
 * Call OpenRouter with an image URL and get structured tags back.
 *
 * @param {object} image  — scraped_images row (needs image_url or storage_path)
 * @param {string} model  — OpenRouter model string
 * @returns {object}      — parsed tag object
 */
async function callVisionModel(image, model) {
  const imageUrl = getImageUrl(image);

  const requestBody = {
    model,
    max_tokens: 500,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type:      'image_url',
            image_url: { url: imageUrl },
          },
          {
            type: 'text',
            text: 'Analyse this Indian wedding decor image and return the JSON object.',
          },
        ],
      },
    ],
  };

  const response = await axios.post(OPENROUTER_URL, requestBody, {
    headers: {
      'Authorization':    `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':     'application/json',
      'HTTP-Referer':     'https://weddingbudget.ai',
      'X-OpenRouter-Title': 'WeddingBudget.ai Admin',
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Parse and validate the model's JSON response.
 * Returns a clean tag object or throws if unparseable.
 */
function parseModelResponse(rawData) {
  const content = rawData.choices?.[0]?.message?.content ?? '';

  // Strip markdown code fences if model wraps in ```json
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model returned non-JSON: ${content.slice(0, 200)}`);
  }

  // Validate and sanitise fields
  const functionType = VALID_FUNCTIONS.includes(parsed.function_type)
    ? parsed.function_type : 'other';

  const style = VALID_STYLES.includes(parsed.style)
    ? parsed.style : 'Traditional';

  const complexity = VALID_COMPLEXITIES.includes(parsed.complexity)
    ? parsed.complexity : 'medium';

  const costMin = Math.max(0, parseInt(parsed.cost_seed_min) || 0);
  const costMax = Math.max(costMin, parseInt(parsed.cost_seed_max) || 0);

  const confidence = Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.7));

  return {
    function_type:   functionType,
    style,
    complexity,
    cost_seed_min:   costMin,
    cost_seed_max:   costMax,
    confidence,
    reasoning:       (parsed.reasoning ?? '').slice(0, 500),
  };
}

/**
 * Main export — auto-tag a single image.
 * Tries primary model first, falls back to secondary on error.
 *
 * @param {object} image    — scraped_images row
 * @returns {object}        — { tags, modelUsed, rawResponse, tokensUsed, costUsd }
 */
async function autoTagImage(image) {
  let lastError;

  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const rawData = await callVisionModel(image, model);

      const tags       = parseModelResponse(rawData);
      const usage      = rawData.usage ?? {};
      const tokensUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);

      // Rough cost estimate (OpenRouter charges vary by model)
      // Claude Sonnet ~$3/M input + $15/M output tokens
      const costUsd = model.includes('claude')
        ? (usage.prompt_tokens ?? 0) * 0.000003 + (usage.completion_tokens ?? 0) * 0.000015
        : (tokensUsed * 0.0000005); // Gemini Flash is much cheaper

      return {
        tags,
        modelUsed:   model,
        rawResponse: rawData,
        tokensUsed,
        costUsd:     parseFloat(costUsd.toFixed(6)),
      };

    } catch (err) {
      console.error(`[openrouter] Model ${model} failed: ${err.message}`);
      lastError = err;
      // Continue to fallback
    }
  }

  throw new Error(`All models failed. Last error: ${lastError?.message}`);
}

/**
 * Batch auto-tag multiple images sequentially with a delay between calls.
 * Returns array of results (successes and failures).
 *
 * @param {Array}    images   — array of scraped_images rows
 * @param {Function} onResult — callback per result
 */
async function batchAutoTag(images, onResult = () => {}) {
  const results = [];

  for (const image of images) {
    try {
      const result = await autoTagImage(image);
      results.push({ imageId: image.id, success: true, ...result });
      onResult(image.id, true, result);
    } catch (err) {
      results.push({ imageId: image.id, success: false, error: err.message });
      onResult(image.id, false, { error: err.message });
    }

    // Rate limit: ~2 requests/second to avoid OpenRouter throttling
    await new Promise(r => setTimeout(r, 600));
  }

  return results;
}

module.exports = { autoTagImage, batchAutoTag };
