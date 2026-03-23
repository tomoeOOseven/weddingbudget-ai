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

const PRICE_PATTERNS = [
  /(?:₹|Rs\.?|INR)\s*([\d,]+)\s*(?:onwards|onward|starting|start|per\s*event|\/day|\/event)?/i,
  /(?:starting\s*(?:at|from)|price\s*from|from)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+)/i,
  /([\d,]{4,})\s*(?:onwards|onward)/i,
];

const NOISE_NAME_PATTERNS = [
  /^(log\s*in|login|sign\s*up|signup|menu|view\s*all|read\s*more)$/i,
  /^(home|about|contact|privacy|terms)$/i,
];

function normalizeSpace(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

function extractSeedPrice(text = '') {
  const t = normalizeSpace(text);
  if (!t) return null;
  if (/price\s*on\s*request/i.test(t)) return 'Price on Request';

  for (const pattern of PRICE_PATTERNS) {
    const match = t.match(pattern);
    if (match?.[1]) {
      const digits = String(match[1]).replace(/[^\d]/g, '');
      if (digits) return `Rs ${Number(digits)}`;
    }
  }
  return null;
}

function isProbableNoiseName(name = '') {
  const low = normalizeSpace(name).toLowerCase();
  if (!low || low.length < 3) return true;
  return NOISE_NAME_PATTERNS.some((pattern) => pattern.test(low));
}

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
  const attrs = ['data-lazy-src', 'data-src', 'data-original', 'data-image', 'data-srcset', 'srcset', 'src'];
  for (const attr of attrs) {
    let val = $(el).attr(attr);
    if (!val) continue;
    // srcset: take the first URL (highest resolution comes last — take last)
    if (attr === 'srcset' || attr === 'data-srcset') {
      const parts = val.split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean);
      val = parts[0] ?? parts[parts.length - 1];
    }
    const url = resolveUrl(val, baseUrl);
    if (url && /\.(jpe?g|png|webp|avif)(\?|$)/i.test(url)) return url;
  }
  return null;
}

function pickNameFromCard($, card, img, config) {
  const selectors = [
    config.titleSelector,
    '[itemprop="name"]',
    'h1, h2, h3, h4',
    '[class*="title"]',
    '[class*="name"]',
    '[class*="heading"]',
  ].filter(Boolean);

  for (const sel of selectors) {
    const txt = normalizeSpace(card.find(sel).first().text());
    if (txt && !isProbableNoiseName(txt)) return txt.slice(0, 255);
  }

  const alt = normalizeSpace($(img).attr('alt') || $(img).attr('title'));
  if (alt && !isProbableNoiseName(alt)) return alt.slice(0, 255);

  const raw = normalizeSpace(card.text());
  if (!raw) return null;
  const candidate = raw.split('|')[0].split('.')[0].trim();
  if (!candidate || isProbableNoiseName(candidate)) return null;
  return candidate.slice(0, 255);
}

function extractWedMeGoodCards($, pageUrl, config) {
  const out = [];
  const seen = new Set();

  const selector = 'div[class*="vendor" i], a[href*="/profile/"]';
  $(selector).each((_, el) => {
    const card = $(el);
    const img = card.find('img').first();
    if (!img.length) return;

    const imageUrl = extractImgSrc($, img, pageUrl);
    if (!imageUrl) return;

    const title = pickNameFromCard($, card, img, config);
    if (!title) return;

    const linkHref = card.find('a[href]').first().attr('href') || card.closest('a[href]').attr('href') || null;
    const listingUrl = resolveUrl(linkHref, pageUrl);
    const textBlob = normalizeSpace(card.text());
    const selectorPrice = config.priceSelector ? normalizeSpace(card.find(config.priceSelector).first().text()) : null;
    const priceText = extractSeedPrice(`${selectorPrice || ''} ${textBlob}`) || selectorPrice || null;

    const dedupeKey = `${title.toLowerCase()}|${imageUrl}|${listingUrl || ''}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    out.push({
      imageUrl,
      sourceUrl: pageUrl,
      title,
      description: textBlob ? textBlob.slice(0, 1000) : null,
      scrapedTags: [],
      priceText,
      listingUrl: listingUrl || null,
    });
  });

  return out;
}

function extractFromJsonLd($, pageUrl) {
  const out = [];
  const seen = new Set();

  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = normalizeSpace($(node).text() || '');
    if (!raw) return;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const stack = Array.isArray(data) ? [...data] : [data];
    while (stack.length) {
      const obj = stack.pop();
      if (Array.isArray(obj)) {
        stack.push(...obj);
        continue;
      }
      if (!obj || typeof obj !== 'object') continue;

      if (obj['@graph']) stack.push(obj['@graph']);
      if (obj.itemListElement) stack.push(obj.itemListElement);

      const item = obj.item && typeof obj.item === 'object' ? obj.item : obj;
      const title = normalizeSpace(item.name || '');
      if (!title || isProbableNoiseName(title)) continue;

      const imageRaw = Array.isArray(item.image) ? item.image[0] : item.image;
      const imageUrl = resolveUrl(String(imageRaw || ''), pageUrl);

      const listingUrl = resolveUrl(String(item.url || ''), pageUrl);
      const offerPrice = item.offers?.price || item.offers?.priceSpecification?.price || null;
      const priceText = offerPrice ? extractSeedPrice(String(offerPrice)) || `Rs ${Number(String(offerPrice).replace(/[^\d]/g, ''))}` : extractSeedPrice(JSON.stringify(item));

      if (!imageUrl && !priceText) continue;

      const dedupeKey = `${title.toLowerCase()}|${imageUrl || ''}|${listingUrl || ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({
        imageUrl: imageUrl || null,
        sourceUrl: pageUrl,
        title: title.slice(0, 255),
        description: null,
        scrapedTags: [],
        priceText: priceText || null,
        listingUrl: listingUrl || null,
      });
    }
  });

  return out.filter((row) => Boolean(row.imageUrl));
}

/**
 * Attempt to paginate — looks for "next page" links.
 */
function findNextPage($, currentUrl) {
  const selectors = [
    'a[rel="next"]',
    '.next a',
    '.pagination .next',
    'a.next-page',
    'a[aria-label*="next" i]',
  ];

  for (const sel of selectors) {
    const href = $(sel).first().attr('href');
    const resolved = resolveUrl(href, currentUrl);
    if (resolved && resolved !== currentUrl) return resolved;
  }

  // Text-based fallback for sites that do not expose semantic next selectors.
  let fallbackHref = null;
  $('a[href]').each((_, a) => {
    if (fallbackHref) return;
    const text = normalizeSpace($(a).text()).toLowerCase();
    if (['next', 'next page', '>', '>>'].includes(text)) {
      fallbackHref = $(a).attr('href');
    }
  });

  return resolveUrl(fallbackHref, currentUrl);
}

function pickContainer($, el) {
  return $(el).closest(
    'article, .card, .photo-item, .gallery-item, .post, .inspiration-item, figure, .item, li, [class*="vendor"], [class*="listing"], [class*="result"]'
  );
}

function pickName($, container, el, config) {
  const selectors = [
    config.titleSelector,
    '[itemprop="name"]',
    'h1, h2, h3, h4',
    '[class*="title"]',
    '[class*="name"]',
  ].filter(Boolean);

  for (const sel of selectors) {
    const txt = normalizeSpace(container.find(sel).first().text());
    if (txt && txt.length >= 3) return txt.slice(0, 255);
  }

  const alt = normalizeSpace($(el).attr('alt') || $(el).attr('title'));
  if (alt && alt.length >= 3) return alt.slice(0, 255);

  const raw = normalizeSpace(container.text());
  if (!raw) return null;
  return raw.split('|')[0].split('.')[0].trim().slice(0, 255) || null;
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

  if (config.wedmegoodMode) {
    const combined = [
      ...extractWedMeGoodCards($, url, config),
      ...extractFromJsonLd($, url),
    ];

    for (const row of combined) {
      if (!row.imageUrl || seen.has(row.imageUrl)) continue;
      seen.add(row.imageUrl);
      images.push({
        imageUrl: row.imageUrl,
        sourceUrl: row.sourceUrl,
        title: row.title,
        description: row.description,
        scrapedTags: row.scrapedTags,
        priceText: row.priceText,
      });
    }

    return { images, nextUrl: null };
  }

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
    const container = pickContainer($, el);

    const title = pickName($, container, el, config);

    const description = (
      container.find(config.descSelector).first().text() || ''
    ).trim().slice(0, 1000) || null;

    const selectorPrice = config.priceSelector
      ? container.find(config.priceSelector).first().text().trim()
      : null;

    const inferredPrice = extractSeedPrice(`${selectorPrice || ''} ${container.text()}`);

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
      description,
      scrapedTags: [...new Set(scrapedTags)].slice(0, 10),
      priceText:   inferredPrice || selectorPrice || null,
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
  const followNextPages = config.followNextPages !== false;
  const stopOnEmptyPage = config.stopOnEmptyPage === true;
  let stopAll = false;

  for (const seedUrl of config.urls) {
    if (stopAll) break;
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
      if (stopOnEmptyPage && images.length === 0) {
        logFn('[cheerio] Empty page detected, stopping further pagination for this source.');
        if (!followNextPages) stopAll = true;
        break;
      }
      currentUrl = followNextPages ? nextUrl : null;
    }
  }

  return allImages;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runCheerioScraper, scrapePage };
