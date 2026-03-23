// scraper/cheerioScraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Uses Axios + Cheerio to scrape static/server-rendered sites.
// Much faster and lighter than Playwright — use for non-JS-heavy sites.
// Returns: Array of { imageUrl, sourceUrl, title, description, scrapedTags }
// ─────────────────────────────────────────────────────────────────────────────

const axios   = require('axios');
const cheerio = require('cheerio');

const BASE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control':   'no-cache',
  'DNT':             '1',
};

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(href, base) {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/**
 * Extract the best image src from an <img> element.
 * Prefers data-src / srcset (lazy-loaded) over src.
 */
function extractImgSrc($, el, baseUrl) {
  const attrs = ['data-lazy-src', 'data-src', 'data-original', 'srcset', 'src'];
  for (const attr of attrs) {
    let val = $(el).attr(attr);
    if (!val) continue;
    // srcset: take the first URL (highest resolution comes last — take last)
    if (attr === 'srcset') {
      const parts = val.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      val = parts[parts.length - 1] ?? parts[0];
    }
    const url = resolveUrl(val, baseUrl);
    if (url && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return url;
  }
  return null;
}

/**
 * Attempt to paginate — looks for "next page" links.
 */
function findNextPage($, currentUrl) {
  const selectors = [
    'a[rel="next"]',
    '.next a',
    '.pagination .next',
    'a:contains("Next")',
    'a:contains("→")',
    'a.next-page',
  ];
  for (const sel of selectors) {
    const href = $(sel).first().attr('href');
    const resolved = resolveUrl(href, currentUrl);
    if (resolved && resolved !== currentUrl) return resolved;
  }
  return null;
}

/**
 * Scrape a single page URL.
 *
 * @param {string} url
 * @param {object} config  — site config from siteConfigs.js
 * @param {number} rateLimitMs
 * @returns {object}  { images: [], nextUrl: string|null }
 */
async function scrapePage(url, config, rateLimitMs = 1500) {
  await sleep(rateLimitMs);

  let html;
  try {
    const res = await axios.get(url, {
      headers: BASE_HEADERS,
      timeout: 20000,
      maxRedirects: 5,
    });
    html = res.data;
  } catch (err) {
    console.warn(`[cheerio] Failed to fetch ${url}: ${err.message}`);
    return { images: [], nextUrl: null };
  }

  const $      = cheerio.load(html);
  const images = [];
  const seen   = new Set();

  $(config.imageSelector).each((_, el) => {
    const imageUrl = extractImgSrc($, el, url);
    if (!imageUrl || seen.has(imageUrl)) return;

    // Skip tiny tracking pixels, icons, logos
    const src = imageUrl.toLowerCase();
    if (
      src.includes('logo') ||
      src.includes('icon') ||
      src.includes('avatar') ||
      src.includes('placeholder') ||
      src.includes('loading') ||
      src.includes('1x1') ||
      src.includes('pixel')
    ) return;

    seen.add(imageUrl);

    // Try to find associated title + description from nearby DOM elements
    const container = $(el).closest(
      'article, .card, .photo-item, .gallery-item, .post, .inspiration-item, figure, .item'
    );

    const title = (
      container.find(config.titleSelector).first().text() ||
      $(el).attr('alt') ||
      $(el).attr('title') ||
      ''
    ).trim().slice(0, 255);

    const description = (
      container.find(config.descSelector).first().text() || ''
    ).trim().slice(0, 1000);

    const priceText = config.priceSelector
      ? container.find(config.priceSelector).first().text().trim()
      : null;

    const scrapedTags = [];
    // Extract any category/tag links near the image
    container.find('a[href*="/category/"], a[href*="/tag/"], .tag, .category').each((_, t) => {
      const tag = $(t).text().trim();
      if (tag && tag.length < 50) scrapedTags.push(tag);
    });

    images.push({
      imageUrl,
      sourceUrl:   url,
      title:       title || null,
      description: description || null,
      scrapedTags: [...new Set(scrapedTags)].slice(0, 10),
      priceText:   priceText || null,
    });
  });

  const nextUrl = findNextPage($, url);

  return { images, nextUrl };
}

/**
 * Scrape all seed URLs for a site, paginating up to maxPages.
 *
 * @param {object} config    — site config
 * @param {number} maxPages  — override from DB
 * @param {Function} logFn   — job log callback
 * @returns {Array}          — all scraped image records
 */
async function runCheerioScraper(config, maxPages, logFn = () => {}) {
  const allImages = [];
  const seenUrls  = new Set();

  for (const seedUrl of config.urls) {
    let currentUrl = seedUrl;
    let page = 0;

    while (currentUrl && page < maxPages) {
      page++;
      logFn(`[cheerio] Page ${page}/${maxPages}: ${currentUrl}`);

      const { images, nextUrl } = await scrapePage(currentUrl, config, config.rateLimitMs ?? 1500);

      for (const img of images) {
        if (!seenUrls.has(img.imageUrl)) {
          seenUrls.add(img.imageUrl);
          allImages.push(img);
        }
      }

      logFn(`[cheerio]   → found ${images.length} images (total: ${allImages.length})`);
      currentUrl = nextUrl;
    }
  }

  return allImages;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runCheerioScraper, scrapePage };
