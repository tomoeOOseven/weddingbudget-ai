// routes/labelling.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only endpoints for the image labelling pipeline.
//
// GET  /api/labelling/queue             — paginated raw images awaiting labels
// GET  /api/labelling/image/:id         — single image detail
// POST /api/labelling/label             — submit a manual label
// POST /api/labelling/autotag/:imageId  — trigger AI auto-tag for one image
// POST /api/labelling/autotag/batch     — AI auto-tag multiple images
// GET  /api/labelling/suggestions       — list pending AI suggestions
// PUT  /api/labelling/suggestions/:id   — accept / edit / reject a suggestion
// GET  /api/labelling/dataset           — browse the confirmed training dataset
// PUT  /api/labelling/dataset/:labelId/toggle — toggle is_in_training flag
// GET  /api/labelling/stats             — labelling pipeline stats
//
// bypass flag (on autotag routes):
//   bypass: false (default) — AI result staged as pending suggestion, admin reviews before dataset entry
//   bypass: true            — AI result written directly to image_labels, no review step
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { autoTagImage, batchAutoTag }  = require('../services/openrouterService');

// ── GET /api/labelling/queue ───────────────────────────────────────────────
router.get('/queue', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit)  || 24, 100);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status || 'raw';

  let query = supabaseAdmin
    .from('scraped_images')
    .select(`
      id, source_url, image_url, storage_path, title, description,
      scraped_tags, width_px, height_px, status, created_at,
      scrape_sources ( name ),
      image_labels ( id, function_type, style, complexity, cost_seed_min, cost_seed_max, label_source, confidence ),
      ai_label_suggestions ( id, status, suggested_function, suggested_style, suggested_complexity, suggested_cost_min, suggested_cost_max, confidence )
    `, { count: 'exact' })
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.sourceId) query = query.eq('source_id', req.query.sourceId);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const images = (data ?? []).map(img => ({
    ...img,
    publicUrl: img.storage_path
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/decor-images/${img.storage_path}`
      : img.image_url,
  }));

  res.json({ images, total: count, offset, limit });
});

// ── GET /api/labelling/image/:id ───────────────────────────────────────────
router.get('/image/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('scraped_images')
    .select(`*, scrape_sources ( name, base_url ), image_labels ( * ), ai_label_suggestions ( * )`)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Image not found.' });

  res.json({
    ...data,
    publicUrl: data.storage_path
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/decor-images/${data.storage_path}`
      : data.image_url,
  });
});

// ── POST /api/labelling/label ──────────────────────────────────────────────
router.post('/label', requireAdmin, async (req, res) => {
  const { imageId, function_type, style, complexity, cost_seed_min, cost_seed_max, notes } = req.body;

  if (!imageId || !function_type || !style || !complexity) {
    return res.status(400).json({ error: 'imageId, function_type, style, complexity are required.' });
  }
  if (cost_seed_min === undefined || cost_seed_max === undefined) {
    return res.status(400).json({ error: 'cost_seed_min and cost_seed_max are required.' });
  }

  const { data: label, error: labelError } = await supabaseAdmin
    .from('image_labels')
    .upsert({
      image_id:       imageId,
      function_type,
      style,
      complexity,
      cost_seed_min:  parseInt(cost_seed_min),
      cost_seed_max:  parseInt(cost_seed_max),
      label_source:   'manual',
      confidence:     1.0,
      labelled_by:    req.profile.id,
      labelled_at:    new Date().toISOString(),
      notes:          notes ?? null,
      is_in_training: true,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'image_id' })
    .select()
    .single();

  if (labelError) return res.status(500).json({ error: labelError.message });

  await supabaseAdmin
    .from('scraped_images')
    .update({ status: 'labelled' })
    .eq('id', imageId);

  res.json({ label, message: 'Image labelled successfully.' });
});

// ── POST /api/labelling/autotag/:imageId ──────────────────────────────────
// Body: { bypass?: boolean }
//   bypass: false (default) — stage as pending suggestion for admin sign-off
//   bypass: true            — write directly to image_labels, skip review
router.post('/autotag/:imageId([0-9a-fA-F-]{36})', requireAdmin, async (req, res) => {
  const { imageId } = req.params;
  const bypass = req.body.bypass === true;

  const { data: image, error: imgError } = await supabaseAdmin
    .from('scraped_images')
    .select('id, image_url, storage_path')
    .eq('id', imageId)
    .single();

  if (imgError || !image) return res.status(404).json({ error: 'Image not found.' });

  // Block if a pending suggestion already exists
  const { data: existing } = await supabaseAdmin
    .from('ai_label_suggestions')
    .select('id, status')
    .eq('image_id', imageId)
    .eq('status', 'pending')
    .limit(1);

  if (existing?.length > 0) {
    return res.status(409).json({
      error: 'This image already has a pending AI suggestion. Review or reject it first.',
      suggestionId: existing[0].id,
    });
  }

  try {
    const { tags, modelUsed, rawResponse, tokensUsed, costUsd } = await autoTagImage(image);

    if (bypass) {
      // ── BYPASS: write directly to training set ──────────────────────────
      // Still log to ai_label_suggestions as audit trail
      supabaseAdmin.from('ai_label_suggestions').insert({
        image_id: imageId, model_used: modelUsed, raw_response: rawResponse,
        suggested_function: tags.function_type, suggested_style: tags.style,
        suggested_complexity: tags.complexity, suggested_cost_min: tags.cost_seed_min,
        suggested_cost_max: tags.cost_seed_max, confidence: tags.confidence,
        reasoning: tags.reasoning, status: 'accepted',
        reviewed_by: req.profile.id, reviewed_at: new Date().toISOString(),
        tokens_used: tokensUsed, cost_usd: costUsd,
      }).then(() => {}).catch(() => {});

      const { data: label, error: labelError } = await supabaseAdmin
        .from('image_labels')
        .upsert({
          image_id: imageId, function_type: tags.function_type, style: tags.style,
          complexity: tags.complexity, cost_seed_min: tags.cost_seed_min,
          cost_seed_max: tags.cost_seed_max, label_source: 'ai_confirmed',
          confidence: tags.confidence, labelled_by: req.profile.id,
          labelled_at: new Date().toISOString(), is_in_training: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'image_id' })
        .select().single();

      if (labelError) return res.status(500).json({ error: labelError.message });

      await supabaseAdmin.from('scraped_images').update({ status: 'labelled' }).eq('id', imageId);

      return res.json({
        bypassed: true, label, tags, modelUsed, tokensUsed, costUsd,
        message: 'AI tagged and added to training set automatically.',
      });

    } else {
      // ── SIGN-OFF MODE: stage as pending suggestion ──────────────────────
      const { data: suggestion, error: sugError } = await supabaseAdmin
        .from('ai_label_suggestions')
        .insert({
          image_id: imageId, model_used: modelUsed, raw_response: rawResponse,
          suggested_function: tags.function_type, suggested_style: tags.style,
          suggested_complexity: tags.complexity, suggested_cost_min: tags.cost_seed_min,
          suggested_cost_max: tags.cost_seed_max, confidence: tags.confidence,
          reasoning: tags.reasoning, status: 'pending',
          tokens_used: tokensUsed, cost_usd: costUsd,
        })
        .select().single();

      if (sugError) return res.status(500).json({ error: sugError.message });

      return res.json({
        bypassed: false, suggestion, tags, modelUsed, tokensUsed, costUsd,
        message: 'AI suggestion generated. Review and confirm to add to dataset.',
      });
    }

  } catch (err) {
    res.status(500).json({ error: `AI tagging failed: ${err.message}` });
  }
});

// ── POST /api/labelling/autotag/batch ─────────────────────────────────────
// Body: { imageIds: string[], bypass?: boolean }
//   bypass: false (default) — stage all as pending suggestions
//   bypass: true            — write all directly to image_labels
router.post('/autotag/batch', requireAdmin, async (req, res) => {
  const { imageIds, bypass = false } = req.body;

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ error: 'Provide imageIds array.' });
  }
  if (imageIds.length > 50) {
    return res.status(400).json({ error: 'Max 50 images per batch.' });
  }

  const { data: images } = await supabaseAdmin
    .from('scraped_images').select('id, image_url, storage_path').in('id', imageIds);

  if (!images?.length) {
    return res.json({
      message: 'No matching images found for this batch chunk.',
      count: 0,
      bypass,
      skipped: imageIds.length,
    });
  }

  res.json({
    message: `Batch auto-tag started for ${images.length} images (${bypass ? 'auto-approve' : 'review'} mode).`,
    count: images.length, bypass,
  });

  batchAutoTag(images, async (imageId, success, result) => {
    if (!success) return;
    const { tags, modelUsed, rawResponse, tokensUsed, costUsd } = result;

    if (bypass) {
      // Audit log
      supabaseAdmin.from('ai_label_suggestions').upsert({
        image_id: imageId, model_used: modelUsed, raw_response: rawResponse,
        suggested_function: tags.function_type, suggested_style: tags.style,
        suggested_complexity: tags.complexity, suggested_cost_min: tags.cost_seed_min,
        suggested_cost_max: tags.cost_seed_max, confidence: tags.confidence,
        reasoning: tags.reasoning, status: 'accepted',
        tokens_used: tokensUsed, cost_usd: costUsd,
      }, { onConflict: 'image_id' }).then(() => {}).catch(() => {});

      await supabaseAdmin.from('image_labels').upsert({
        image_id: imageId, function_type: tags.function_type, style: tags.style,
        complexity: tags.complexity, cost_seed_min: tags.cost_seed_min,
        cost_seed_max: tags.cost_seed_max, label_source: 'ai_confirmed',
        confidence: tags.confidence, is_in_training: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'image_id' });

      await supabaseAdmin.from('scraped_images').update({ status: 'labelled' }).eq('id', imageId);

    } else {
      // Stage as pending suggestion
      await supabaseAdmin.from('ai_label_suggestions').upsert({
        image_id: imageId, model_used: modelUsed, raw_response: rawResponse,
        suggested_function: tags.function_type, suggested_style: tags.style,
        suggested_complexity: tags.complexity, suggested_cost_min: tags.cost_seed_min,
        suggested_cost_max: tags.cost_seed_max, confidence: tags.confidence,
        reasoning: tags.reasoning, status: 'pending',
        tokens_used: tokensUsed, cost_usd: costUsd,
      }, { onConflict: 'image_id' });
    }

  }).catch(err => console.error('[batch autotag]', err.message));
});

// ── GET /api/labelling/suggestions ────────────────────────────────────────
router.get('/suggestions', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 24, 100);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status || 'pending';

  const { data, error, count } = await supabaseAdmin
    .from('ai_label_suggestions')
    .select(`
      id, status, suggested_function, suggested_style, suggested_complexity,
      suggested_cost_min, suggested_cost_max, confidence, reasoning,
      model_used, tokens_used, cost_usd, created_at,
      scraped_images ( id, image_url, storage_path, title, source_url )
    `, { count: 'exact' })
    .eq('status', status)
    .order('confidence', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(500).json({ error: error.message });

  const suggestions = (data ?? []).map(s => ({
    ...s,
    publicUrl: s.scraped_images?.storage_path
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/decor-images/${s.scraped_images.storage_path}`
      : s.scraped_images?.image_url,
  }));

  res.json({ suggestions, total: count, offset, limit });
});

// ── PUT /api/labelling/suggestions/:id ────────────────────────────────────
// Body: { action: 'accept'|'edit'|'reject', overrides?: { function_type, style, ... } }
router.put('/suggestions/:id', requireAdmin, async (req, res) => {
  const { action, overrides = {} } = req.body;

  if (!['accept', 'edit', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be accept, edit, or reject.' });
  }

  const { data: suggestion, error: sugError } = await supabaseAdmin
    .from('ai_label_suggestions').select('*').eq('id', req.params.id).single();

  if (sugError || !suggestion) return res.status(404).json({ error: 'Suggestion not found.' });

  const newStatus = action === 'reject' ? 'rejected' : action === 'edit' ? 'edited' : 'accepted';
  await supabaseAdmin
    .from('ai_label_suggestions')
    .update({ status: newStatus, reviewed_by: req.profile.id, reviewed_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (action === 'reject') {
    await supabaseAdmin
      .from('scraped_images')
      .update({ status: 'rejected' })
      .eq('id', suggestion.image_id);

    return res.json({ message: 'Suggestion rejected and removed from queue.' });
  }

  const finalTags = {
    function_type: overrides.function_type ?? suggestion.suggested_function,
    style:         overrides.style         ?? suggestion.suggested_style,
    complexity:    overrides.complexity    ?? suggestion.suggested_complexity,
    cost_seed_min: overrides.cost_seed_min ?? suggestion.suggested_cost_min,
    cost_seed_max: overrides.cost_seed_max ?? suggestion.suggested_cost_max,
  };

  const { data: label, error: labelError } = await supabaseAdmin
    .from('image_labels')
    .upsert({
      image_id:       suggestion.image_id,
      ...finalTags,
      label_source:   'ai_confirmed',
      confidence:     suggestion.confidence,
      labelled_by:    req.profile.id,
      labelled_at:    new Date().toISOString(),
      is_in_training: true,
      updated_at:     new Date().toISOString(),
    }, { onConflict: 'image_id' })
    .select().single();

  if (labelError) return res.status(500).json({ error: labelError.message });

  await supabaseAdmin.from('scraped_images').update({ status: 'labelled' }).eq('id', suggestion.image_id);

  res.json({ label, finalTags, message: `Suggestion ${newStatus}. Image added to dataset.` });
});

// ── GET /api/labelling/dataset ─────────────────────────────────────────────
router.get('/dataset', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 24, 100);
  const offset = parseInt(req.query.offset) || 0;

  let query = supabaseAdmin
    .from('image_labels')
    .select(`
      id, function_type, style, complexity, cost_seed_min, cost_seed_max,
      label_source, confidence, is_in_training, labelled_at,
      scraped_images ( id, image_url, storage_path, title )
    `, { count: 'exact' })
    .order('labelled_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.inTraining === 'true')  query = query.eq('is_in_training', true);
  if (req.query.inTraining === 'false') query = query.eq('is_in_training', false);
  if (req.query.function_type)          query = query.eq('function_type', req.query.function_type);
  if (req.query.style)                  query = query.eq('style', req.query.style);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const labels = (data ?? []).map(l => ({
    ...l,
    publicUrl: l.scraped_images?.storage_path
      ? `${process.env.SUPABASE_URL}/storage/v1/object/public/decor-images/${l.scraped_images.storage_path}`
      : l.scraped_images?.image_url,
  }));

  res.json({ labels, total: count, offset, limit });
});

// ── PUT /api/labelling/dataset/:labelId/toggle ─────────────────────────────
router.put('/dataset/:labelId/toggle', requireAdmin, async (req, res) => {
  const { data: current } = await supabaseAdmin
    .from('image_labels').select('is_in_training').eq('id', req.params.labelId).single();

  if (!current) return res.status(404).json({ error: 'Label not found.' });

  const { data, error } = await supabaseAdmin
    .from('image_labels')
    .update({ is_in_training: !current.is_in_training, updated_at: new Date().toISOString() })
    .eq('id', req.params.labelId)
    .select().single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ label: data, message: `Image ${data.is_in_training ? 'added to' : 'removed from'} training set.` });
});

// ── GET /api/labelling/stats ───────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  const [
    { count: totalRaw },
    { count: totalLabelled },
    { count: inTraining },
    { count: pendingSuggestions },
    { count: totalRejected },
  ] = await Promise.all([
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'raw'),
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'labelled'),
    supabaseAdmin.from('image_labels').select('*', { count: 'exact', head: true }).eq('is_in_training', true),
    supabaseAdmin.from('ai_label_suggestions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
  ]);

  const queueCount = Math.max((totalRaw ?? 0) - (pendingSuggestions ?? 0) - (totalRejected ?? 0), 0);

  res.json({ totalRaw, queueCount, totalLabelled, inTraining, pendingSuggestions, totalRejected });
});

module.exports = router;