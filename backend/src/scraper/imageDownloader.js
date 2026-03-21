// scraper/imageDownloader.js
// ─────────────────────────────────────────────────────────────────────────────
// Handles:
//   1. Downloading images from scraped URLs
//   2. Computing perceptual hash (aHash) for deduplication
//   3. Uploading to Supabase Storage under decor-images/
//   4. Returning metadata (storage path, dimensions, file size, hash)
// ─────────────────────────────────────────────────────────────────────────────

const axios  = require('axios');
const sharp  = require('sharp');
const path   = require('path');
const crypto = require('crypto');
const { supabaseAdmin } = require('../middleware/authMiddleware');

const STORAGE_BUCKET = 'decor-images';
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_FILE_SIZE_BYTES  = 8 * 1024 * 1024; // 8 MB — skip oversized images

// ── Perceptual hash (average hash / aHash) ─────────────────────────────────
// 1. Resize to 8x8 grayscale  →  64 pixels
// 2. Compute mean pixel value
// 3. Each pixel: 1 if > mean, 0 otherwise  →  64-bit fingerprint
// 4. Convert to 16-char hex string
//
// Hamming distance < 10 = near-duplicate

async function computeAHash(imageBuffer) {
  try {
    const { data: pixels } = await sharp(imageBuffer)
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const mean = pixels.reduce((s, v) => s + v, 0) / pixels.length;
    let bits = '';
    for (const pixel of pixels) bits += pixel >= mean ? '1' : '0';

    // Convert 64 binary chars → 16 hex chars
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    // Return random hash on failure — won't dedup but won't crash
    return crypto.randomBytes(8).toString('hex');
  }
}

// ── Get image dimensions ───────────────────────────────────────────────────
async function getImageMeta(buffer) {
  try {
    const { width, height } = await sharp(buffer).metadata();
    return { width, height };
  } catch {
    return { width: null, height: null };
  }
}

// ── Build a stable storage path ────────────────────────────────────────────
// Format: {sourceSlug}/{YYYY-MM}/{hash}.{ext}
function buildStoragePath(sourceSlug, hash, imageUrl) {
  const ext   = (path.extname(new URL(imageUrl).pathname).split('?')[0] || '.jpg')
                  .toLowerCase()
                  .replace(/[^.a-z]/, '');
  const validExt = ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext) ? ext : '.jpg';
  const ym    = new Date().toISOString().slice(0, 7); // e.g. "2025-06"
  return `${sourceSlug}/${ym}/${hash}${validExt}`;
}

// ── Main download + upload function ───────────────────────────────────────
/**
 * @param {string} imageUrl   — Original image URL to download
 * @param {string} sourceSlug — Short name of source (used in storage path)
 * @param {number} minWidth   — Skip images narrower than this (filters icons)
 * @returns {object|null}     — Metadata object, or null if skipped
 */
async function downloadAndStore(imageUrl, sourceSlug, minWidth = 200) {
  // ── 1. Download ────────────────────────────────────────────────────────
  let response;
  try {
    response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_FILE_SIZE_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WeddingBudgetBot/1.0)',
        'Accept': 'image/webp,image/jpeg,image/png,image/*',
      },
    });
  } catch (err) {
    return { skipped: true, reason: `download_failed: ${err.message}` };
  }

  const contentType = response.headers['content-type'] ?? '';
  if (!contentType.startsWith('image/')) {
    return { skipped: true, reason: 'not_an_image' };
  }

  const buffer = Buffer.from(response.data);

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { skipped: true, reason: 'file_too_large' };
  }

  // ── 2. Validate dimensions ─────────────────────────────────────────────
  const { width, height } = await getImageMeta(buffer);
  if (width && width < minWidth) {
    return { skipped: true, reason: `too_small: ${width}px` };
  }

  // ── 3. Compute pHash ───────────────────────────────────────────────────
  const hash = await computeAHash(buffer);

  // ── 4. Check duplicate ─────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('scraped_images')
    .select('id, storage_path')
    .eq('image_hash', hash)
    .limit(1);

  if (existing?.length > 0) {
    return { skipped: true, reason: 'duplicate', existingId: existing[0].id };
  }

  // ── 5. Upload to Supabase Storage ──────────────────────────────────────
  const storagePath = buildStoragePath(sourceSlug, hash, imageUrl);
  const mimeType    = contentType.split(';')[0].trim();

  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,           // don't overwrite if hash collides
      cacheControl: '2592000', // 30 days CDN cache
    });

  if (uploadError) {
    if (uploadError.message?.includes('already exists')) {
      return { skipped: true, reason: 'storage_duplicate' };
    }
    return { skipped: true, reason: `upload_failed: ${uploadError.message}` };
  }

  // ── 6. Return metadata ─────────────────────────────────────────────────
  return {
    skipped:          false,
    imageHash:        hash,
    storagePath,
    widthPx:          width,
    heightPx:         height,
    fileSizeBytes:    buffer.length,
    mimeType,
  };
}

// ── Batch downloader ───────────────────────────────────────────────────────
/**
 * Process a list of scraped image results, downloading each concurrently
 * with a concurrency cap to avoid hammering the target or Supabase.
 *
 * @param {Array}  images      — [{imageUrl, sourceUrl, title, description}]
 * @param {string} sourceSlug  — used in storage path
 * @param {string} sourceId    — UUID of scrape_sources row
 * @param {string} jobId       — UUID of scrape_jobs row
 * @param {number} minWidth    — minimum image width
 * @param {Function} logFn     — callback for job log lines
 * @returns {object}  { saved, duped, failed }
 */
async function batchDownloadAndStore(images, sourceSlug, sourceId, jobId, minWidth = 200, logFn = () => {}) {
  const CONCURRENCY = 3; // parallel downloads at a time
  let saved = 0, duped = 0, failed = 0;

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < images.length; i += CONCURRENCY) {
    const chunk = images.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      chunk.map(async (img) => {
        const result = await downloadAndStore(img.imageUrl, sourceSlug, minWidth);

        if (result.skipped) {
          if (result.reason === 'duplicate' || result.reason === 'storage_duplicate') {
            return { type: 'dupe' };
          }
          logFn(`Skip [${result.reason}]: ${img.imageUrl.slice(0, 80)}`);
          return { type: 'skip' };
        }

        // Insert row into scraped_images
        const { error: insertError } = await supabaseAdmin
          .from('scraped_images')
          .insert({
            job_id:         jobId,
            source_id:      sourceId,
            source_url:     img.sourceUrl,
            image_url:      img.imageUrl,
            storage_path:   result.storagePath,
            title:          img.title   ?? null,
            description:    img.description ?? null,
            scraped_tags:   img.scrapedTags ?? [],
            image_hash:     result.imageHash,
            width_px:       result.widthPx,
            height_px:      result.heightPx,
            file_size_bytes:result.fileSizeBytes,
            status:         'raw',
          });

        if (insertError) {
          logFn(`DB insert error: ${insertError.message} (${img.imageUrl.slice(0, 60)})`);
          return { type: 'fail' };
        }

        logFn(`Saved: ${result.storagePath}`);
        return { type: 'saved' };
      })
    );

    for (const r of results) {
      if (r.type === 'saved') saved++;
      else if (r.type === 'dupe') duped++;
      else failed++;
    }

    // Small pause between chunks to be polite to Supabase Storage
    await sleep(200);
  }

  return { saved, duped, failed };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { downloadAndStore, batchDownloadAndStore, computeAHash };
