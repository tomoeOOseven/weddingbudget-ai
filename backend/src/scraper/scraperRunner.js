// scraper/scraperRunner.js
// ─────────────────────────────────────────────────────────────────────────────
// Orchestrates a complete scrape run:
//   1. Creates a scrape_jobs row (status = 'running')
//   2. Loads the site config (DB selectors take priority over code config)
//   3. Routes to Playwright or Cheerio scraper based on scraper_type
//   4. Downloads + stores images via imageDownloader
//   5. Updates the job row throughout with progress + final stats
//   6. Updates scrape_sources.last_scraped_at on completion
// ─────────────────────────────────────────────────────────────────────────────

const { supabaseAdmin }         = require('../middleware/authMiddleware');
const { SITE_CONFIGS }          = require('./siteConfigs');
const { runCheerioScraper }     = require('./cheerioScraper');
const { runPlaywrightScraper }  = require('./playwrightScraper');
const { batchDownloadAndStore } = require('./imageDownloader');

/**
 * slugify a site name for use in storage paths.
 * "WedMeGood" → "wedmegood"
 */
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

/**
 * Append a log line to a job's log array in the DB.
 * We batch these locally and flush periodically to reduce DB writes.
 */
class JobLogger {
  constructor(jobId) {
    this.jobId  = jobId;
    this.buffer = [];
    this.lastFlush = Date.now();
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(`  [job:${this.jobId.slice(0,8)}] ${msg}`);
    this.buffer.push(line);
    // Auto-flush every 5 seconds or every 20 lines
    if (this.buffer.length >= 20 || Date.now() - this.lastFlush > 5000) {
      this.flush().catch(() => {});
    }
  }

  async flush() {
    if (!this.buffer.length) return;
    const lines = [...this.buffer];
    this.buffer = [];
    this.lastFlush = Date.now();

    // Append to existing log array using Supabase RPC
    // We do a read-modify-write since Supabase doesn't have native array append via update
    const { data } = await supabaseAdmin
      .from('scrape_jobs')
      .select('log')
      .eq('id', this.jobId)
      .single();

    const existingLog = data?.log ?? [];
    await supabaseAdmin
      .from('scrape_jobs')
      .update({ log: [...existingLog, ...lines] })
      .eq('id', this.jobId);
  }
}

/**
 * Run a single source scrape job.
 *
 * @param {object} source        — Row from scrape_sources table
 * @param {string|null} triggeredBy — Admin user UUID, or null if cron
 * @returns {object}             — { jobId, saved, duped, failed }
 */
async function runScrapeJob(source, triggeredBy = null) {
  // ── 1. Create job record ──────────────────────────────────────────────
  const { data: job, error: jobError } = await supabaseAdmin
    .from('scrape_jobs')
    .insert({
      source_id:    source.id,
      status:       'running',
      triggered_by: triggeredBy,
      started_at:   new Date().toISOString(),
      log:          [],
    })
    .select()
    .single();

  if (jobError) throw new Error(`Failed to create scrape job: ${jobError.message}`);

  const jobId  = job.id;
  const logger = new JobLogger(jobId);
  logger.log(`Scrape job started for: ${source.name} (${source.base_url})`);
  logger.log(`Scraper type: ${source.scraper_type} | Rate limit: ${source.rate_limit_ms}ms`);

  // ── 2. Build effective config (DB selectors override code config) ─────
  const codeConfig = SITE_CONFIGS[source.base_url] ?? {};

  // DB selectors JSONB takes priority if admin has overridden them
  const dbSelectors = source.selectors ?? {};
  const config = {
    ...codeConfig,
    scraper_type:  source.scraper_type,
    rateLimitMs:   source.rate_limit_ms ?? codeConfig.rateLimitMs ?? 2000,
    urls:          (source.url_patterns?.length > 0 ? source.url_patterns : null) ?? codeConfig.urls ?? [source.base_url],
    maxPages:      codeConfig.maxPages ?? 2,
    // DB-stored selectors override code selectors
    imageSelector: dbSelectors.imageSelector ?? codeConfig.imageSelector ?? 'img',
    titleSelector: dbSelectors.titleSelector ?? codeConfig.titleSelector ?? 'h2, h3',
    descSelector:  dbSelectors.descSelector  ?? codeConfig.descSelector  ?? 'p',
    priceSelector: dbSelectors.priceSelector ?? codeConfig.priceSelector ?? null,
    waitFor:       dbSelectors.waitFor       ?? codeConfig.waitFor       ?? null,
    scrollToLoad:  codeConfig.scrollToLoad   ?? false,
    minImageW:     codeConfig.minImageW      ?? 200,
  };

  const sourceSlug = toSlug(source.name);
  let imagesFound = 0, saved = 0, duped = 0, failed = 0;

  try {
    // ── 3. Run the right scraper ────────────────────────────────────────
    let rawImages;

    if (source.scraper_type === 'playwright') {
      rawImages = await runPlaywrightScraper(config, config.maxPages, (msg) => logger.log(msg));
    } else {
      rawImages = await runCheerioScraper(config, config.maxPages, (msg) => logger.log(msg));
    }

    imagesFound = rawImages.length;
    logger.log(`Scraping complete. Found ${imagesFound} candidate images. Starting downloads…`);

    // Update job with found count
    await supabaseAdmin
      .from('scrape_jobs')
      .update({ images_found: imagesFound })
      .eq('id', jobId);

    // ── 4. Download + store images ──────────────────────────────────────
    const result = await batchDownloadAndStore(
      rawImages,
      sourceSlug,
      source.id,
      jobId,
      config.minImageW,
      (msg) => logger.log(msg)
    );

    saved  = result.saved;
    duped  = result.duped;
    failed = result.failed;

    logger.log(`Downloads complete. Saved: ${saved} | Duped: ${duped} | Failed: ${failed}`);

    // ── 5. Mark job as completed ────────────────────────────────────────
    await logger.flush();
    await supabaseAdmin
      .from('scrape_jobs')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        images_found: imagesFound,
        images_saved: saved,
        images_duped: duped,
      })
      .eq('id', jobId);

    // ── 6. Update source last_scraped_at ────────────────────────────────
    await supabaseAdmin
      .from('scrape_sources')
      .update({ last_scraped_at: new Date().toISOString() })
      .eq('id', source.id);

  } catch (err) {
    logger.log(`FATAL ERROR: ${err.message}`);
    await logger.flush();

    await supabaseAdmin
      .from('scrape_jobs')
      .update({
        status:        'failed',
        completed_at:  new Date().toISOString(),
        error_message: err.message,
        images_found:  imagesFound,
        images_saved:  saved,
        images_duped:  duped,
      })
      .eq('id', jobId);
  }

  return { jobId, saved, duped, failed, imagesFound };
}

/**
 * Run all active sources sequentially.
 * Used by cron or the "Run All" admin action.
 *
 * @param {string|null} triggeredBy — Admin UUID or null for cron
 * @param {Function}    onJobDone   — Callback after each source completes
 */
async function runAllSources(triggeredBy = null, onJobDone = () => {}) {
  const { data: sources, error } = await supabaseAdmin
    .from('scrape_sources')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Failed to load scrape sources: ${error.message}`);
  if (!sources?.length) return { totalSaved: 0, totalDuped: 0, jobs: [] };

  console.log(`[scraperRunner] Starting all-source run: ${sources.length} sources`);

  let totalSaved = 0, totalDuped = 0;
  const jobs = [];

  for (const source of sources) {
    console.log(`\n[scraperRunner] ── ${source.name} ──`);
    try {
      const result = await runScrapeJob(source, triggeredBy);
      totalSaved += result.saved;
      totalDuped += result.duped;
      jobs.push({ source: source.name, ...result });
      onJobDone(source.name, result);
    } catch (err) {
      console.error(`[scraperRunner] Source ${source.name} failed: ${err.message}`);
      jobs.push({ source: source.name, error: err.message });
    }

    // Pause between sources
    await sleep(3000);
  }

  console.log(`\n[scraperRunner] All done. Total saved: ${totalSaved}, duped: ${totalDuped}`);
  return { totalSaved, totalDuped, jobs };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runScrapeJob, runAllSources };
