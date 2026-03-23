// routes/scraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin-only endpoints for the scraping pipeline.
//
// POST /api/scraper/run              — trigger scrape (single source or all)
// GET  /api/scraper/jobs             — list recent jobs
// GET  /api/scraper/jobs/:id         — job detail + full log
// GET  /api/scraper/sources          — list all scrape sources
// POST /api/scraper/sources          — add a new source
// PUT  /api/scraper/sources/:id      — update a source (selectors, urls, etc.)
// PUT  /api/scraper/sources/:id/toggle — enable/disable a source
// GET  /api/scraper/images           — list scraped images (paginated)
// GET  /api/scraper/stats            — pipeline stats summary
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const { requireAdmin, supabaseAdmin } = require('../middleware/authMiddleware');
const { runScrapeJob, runAllSources } = require('../scraper/scraper/scraperRunner');

// Track in-progress jobs to prevent duplicate runs (simple in-process lock)
const runningJobs = new Set(); // sourceId values currently being scraped
const WMG_CANONICAL_URL = 'https://www.wedmegood.com/vendors/all/wedding-decorators/';

function isWedMeGoodUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    return new URL(url).hostname.toLowerCase().includes('wedmegood.com');
  } catch {
    return false;
  }
}

function normalizeUrlList(list = []) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((u) => typeof u === 'string' && u.trim()).map((u) => u.trim()))];
}

function canonicalizeWedMeGoodSourceFields({ baseUrl, urlPatterns }) {
  if (!isWedMeGoodUrl(baseUrl)) {
    return { baseUrl, urlPatterns: normalizeUrlList(urlPatterns) };
  }
  return {
    baseUrl: WMG_CANONICAL_URL,
    urlPatterns: [WMG_CANONICAL_URL],
  };
}

// ── POST /api/scraper/run ──────────────────────────────────────────────────
// Body: { sourceId?: string, all?: boolean, pageMin?: number, pageMax?: number }
// Starts a scrape job in the background (non-blocking).
router.post('/run', requireAdmin, async (req, res) => {
  const { sourceId, all, pageMin, pageMax } = req.body;
  const triggeredBy = req.profile.id;
  const runOptions = {
    pageMin: Number.isInteger(Number(pageMin)) ? Number(pageMin) : null,
    pageMax: Number.isInteger(Number(pageMax)) ? Number(pageMax) : null,
  };

  if (!sourceId && !all) {
    return res.status(400).json({ error: 'Provide sourceId or all: true' });
  }

  try {
    if (all) {
      // Check if an all-source run is already active
      if (runningJobs.has('__ALL__')) {
        return res.status(409).json({ error: 'An all-source run is already in progress.' });
      }

      runningJobs.add('__ALL__');
      res.json({ message: 'All-source scrape run started in background.', running: true });

      // Run async — don't await
      runAllSources(triggeredBy, () => {}, runOptions)
        .catch(err => console.error('[scraper:all] Error:', err.message))
        .finally(() => runningJobs.delete('__ALL__'));

    } else {
      // Single source
      if (runningJobs.has(sourceId)) {
        return res.status(409).json({ error: 'This source is already being scraped.' });
      }

      // Load source from DB
      const { data: source, error } = await supabaseAdmin
        .from('scrape_sources')
        .select('*')
        .eq('id', sourceId)
        .eq('is_active', true)
        .single();

      if (error || !source) {
        return res.status(404).json({ error: 'Scrape source not found or inactive.' });
      }

      runningJobs.add(sourceId);
      res.json({ message: `Scrape started for ${source.name}.`, running: true, source: source.name });

      // Run async
      runScrapeJob(source, triggeredBy, runOptions)
        .catch(err => console.error(`[scraper:${source.name}] Error:`, err.message))
        .finally(() => runningJobs.delete(sourceId));
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/scraper/jobs ──────────────────────────────────────────────────
// Query: ?limit=20&offset=0&status=completed&sourceId=xxx
router.get('/jobs', requireAdmin, async (req, res) => {
  const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset   = parseInt(req.query.offset) || 0;

  let query = supabaseAdmin
    .from('scrape_jobs')
    .select(`
      id, status, started_at, completed_at, images_found,
      images_saved, images_duped, error_message, created_at,
      scrape_sources ( id, name, base_url )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.status)   query = query.eq('status', req.query.status);
  if (req.query.sourceId) query = query.eq('source_id', req.query.sourceId);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Annotate currently running jobs
  const jobs = (data ?? []).map(j => ({
    ...j,
    isCurrentlyRunning: runningJobs.has(j.scrape_sources?.id) || runningJobs.has('__ALL__'),
  }));

  res.json({ jobs, count, offset, limit });
});

// ── GET /api/scraper/jobs/:id ──────────────────────────────────────────────
router.get('/jobs/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('scrape_jobs')
    .select(`
      *, scrape_sources ( id, name, base_url, scraper_type )
    `)
    .eq('id', req.params.id)
    .single();

  if (error) return res.status(404).json({ error: 'Job not found.' });
  res.json(data);
});

// ── GET /api/scraper/sources ───────────────────────────────────────────────
router.get('/sources', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('scrape_sources')
    .select('*')
    .order('name');

  if (error) return res.status(500).json({ error: error.message });

  // Annotate which sources are currently running
  const sources = (data ?? []).map(s => ({
    ...s,
    isRunning: runningJobs.has(s.id) || runningJobs.has('__ALL__'),
  }));

  res.json({ sources });
});

// ── POST /api/scraper/sources ──────────────────────────────────────────────
// Body: { name, base_url, scraper_type, url_patterns, selectors, rate_limit_ms, scrape_interval, notes }
router.post('/sources', requireAdmin, async (req, res) => {
  const {
    name, base_url, scraper_type = 'cheerio',
    url_patterns = [], selectors = {},
    rate_limit_ms = 2000, scrape_interval = '7 days', notes,
  } = req.body;

  const normalizedSource = canonicalizeWedMeGoodSourceFields({
    baseUrl: base_url,
    urlPatterns: url_patterns,
  });

  if (!name || !normalizedSource.baseUrl) {
    return res.status(400).json({ error: 'name and base_url are required.' });
  }

  // Validate scraper_type
  if (!['playwright', 'cheerio'].includes(scraper_type)) {
    return res.status(400).json({ error: 'scraper_type must be playwright or cheerio.' });
  }

  const { data, error } = await supabaseAdmin
    .from('scrape_sources')
    .insert({
      name,
      base_url: normalizedSource.baseUrl,
      scraper_type,
      url_patterns: normalizedSource.urlPatterns,
      selectors,
      rate_limit_ms,
      scrape_interval, notes,
      added_by: req.profile.id,
    })
    .select()
    .single();

  if (error) {
    if (error.message?.includes('unique')) {
      return res.status(409).json({ error: 'A source with this URL already exists.' });
    }
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({ source: data, message: `Source "${name}" added.` });
});

// ── PUT /api/scraper/sources/:id ───────────────────────────────────────────
router.put('/sources/:id', requireAdmin, async (req, res) => {
  const allowed = ['name', 'scraper_type', 'url_patterns', 'selectors', 'rate_limit_ms', 'scrape_interval', 'notes'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from('scrape_sources')
    .select('id, base_url')
    .eq('id', req.params.id)
    .single();

  if (currentError || !current) {
    return res.status(404).json({ error: 'Source not found.' });
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'url_patterns')) {
    const normalized = canonicalizeWedMeGoodSourceFields({
      baseUrl: current.base_url,
      urlPatterns: updates.url_patterns,
    });
    updates.url_patterns = normalized.urlPatterns;
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('scrape_sources')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ source: data, message: 'Source updated.' });
});

// ── PUT /api/scraper/sources/:id/toggle ───────────────────────────────────
router.put('/sources/:id/toggle', requireAdmin, async (req, res) => {
  const { data: current } = await supabaseAdmin
    .from('scrape_sources').select('is_active, name').eq('id', req.params.id).single();

  if (!current) return res.status(404).json({ error: 'Source not found.' });

  const { data, error } = await supabaseAdmin
    .from('scrape_sources')
    .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    source: data,
    message: `"${current.name}" ${data.is_active ? 'enabled' : 'disabled'}.`,
  });
});

// ── GET /api/scraper/images ────────────────────────────────────────────────
// Paginated list of scraped images with optional filters.
// Query: ?status=raw&sourceId=xxx&limit=50&offset=0
router.get('/images', requireAdmin, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  let query = supabaseAdmin
    .from('scraped_images')
    .select(`
      id, source_url, image_url, storage_path, title, description,
      scraped_tags, price_text, price_inr, width_px, height_px, file_size_bytes, status, created_at,
      scrape_sources ( name )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (req.query.status)   query = query.eq('status', req.query.status);
  if (req.query.sourceId) query = query.eq('source_id', req.query.sourceId);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Generate public Storage URLs for each image
  const images = (data ?? []).map(img => {
    if (!img.storage_path) return { ...img, publicUrl: img.image_url };
    const { data: urlData } = supabaseAdmin.storage
      .from('decor-images')
      .getPublicUrl(img.storage_path);
    return { ...img, publicUrl: urlData?.publicUrl ?? img.image_url };
  });

  res.json({ images, offset, limit });
});

// ── GET /api/scraper/stats ─────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  const [
    { count: totalImages },
    { count: rawImages },
    { count: labelledImages },
    { count: totalSources },
    { count: activeSources },
    { data: recentJob },
  ] = await Promise.all([
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'raw'),
    supabaseAdmin.from('scraped_images').select('*', { count: 'exact', head: true }).eq('status', 'labelled'),
    supabaseAdmin.from('scrape_sources').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('scrape_sources').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabaseAdmin.from('scrape_jobs')
      .select('id, status, images_saved, completed_at, scrape_sources(name)')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  res.json({
    totalImages,
    rawImages,
    labelledImages,
    totalSources,
    activeSources,
    currentlyRunning: runningJobs.size,
    lastJob: recentJob?.[0] ?? null,
  });
});

module.exports = router;
