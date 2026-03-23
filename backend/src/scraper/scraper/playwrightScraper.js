// scraper/playwrightScraper.js
// ─────────────────────────────────────────────────────────────────────────────
// Uses Playwright (Chromium) to scrape JS-rendered sites.
// Handles: infinite scroll, lazy-loaded images, cookie banners.
// Returns: Array of { imageUrl, sourceUrl, title, description, scrapedTags }
// ─────────────────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--window-size=1366,768',
];

// Realistic browser fingerprint
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PRICE_PATTERNS = [
  /(?:₹|Rs\.?|INR)\s*([\d,]+)\s*(?:onwards|onward|starting|start|per\s*event|\/day|\/event)?/i,
  /(?:starting\s*(?:at|from)|price\s*from|from)\s*(?:₹|Rs\.?|INR)?\s*([\d,]+)/i,
  /([\d,]{4,})\s*(?:onwards|onward)/i,
];

function extractSeedPrice(text = '') {
  if (!text) return null;
  if (/price\s*on\s*request/i.test(text)) return 'Price on Request';

  for (const pat of PRICE_PATTERNS) {
    const m = text.match(pat);
    if (m?.[1]) {
      const digits = String(m[1]).replace(/[^\d]/g, '');
      if (digits) return `Rs ${Number(digits)}`;
    }
  }
  return null;
}

/**
 * Dismiss common cookie/GDPR banners.
 */
async function dismissBanners(page) {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("I agree")',
    'button:has-text("OK")',
    '[id*="cookie"] button',
    '[class*="cookie"] button',
    '[id*="consent"] button',
    '.gdpr-accept',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await page.waitForTimeout(500);
        break;
      }
    } catch { /* continue */ }
  }
}

/**
 * Scroll down the page to trigger lazy loading / infinite scroll.
 * Scrolls in increments, waits for network to settle.
 */
async function scrollToBottom(page, maxScrolls = 8) {
  let prevHeight = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await page.waitForTimeout(1200);

    const newHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (newHeight === prevHeight) break; // no more content loaded
    prevHeight = newHeight;
  }
}

/**
 * Extract all images matching the selector from the current page DOM.
 */
async function extractImages(page, config, pageUrl) {
  return page.evaluate(({ imageSelector, titleSelector, descSelector, priceSelector }) => {
    const results = [];
    const seen    = new Set();

    const normalizeSpace = (txt = '') => String(txt).replace(/\s+/g, ' ').trim();

    const imgEls = document.querySelectorAll(imageSelector);

    imgEls.forEach(el => {
      // Get best src
      const src = (
        el.getAttribute('data-lazy-src') ||
        el.getAttribute('data-src') ||
        el.getAttribute('data-original') ||
        el.src ||
        ''
      ).trim();

      if (!src || seen.has(src)) return;
      if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(src)) return;
      if (src.includes('logo') || src.includes('icon') || src.includes('1x1')) return;

      seen.add(src);

      // Walk up to find container
      let container = el;
      const containerTags = ['ARTICLE', 'FIGURE', 'SECTION', 'DIV'];
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        if (containerTags.includes(container.tagName) && container.querySelectorAll('img').length === 1) break;
      }

      const getText = (sel) => {
        if (!sel) return '';
        const el = container.querySelector(sel);
        return el ? normalizeSpace(el.textContent || '').slice(0, 255) : '';
      };

      const fallbackName = normalizeSpace(el.getAttribute('alt') || el.getAttribute('title') || '');
      const containerText = normalizeSpace(container.textContent || '');
      const pickedTitle = getText(titleSelector) || getText('[itemprop="name"]') || getText('h1, h2, h3, h4') || fallbackName;

      results.push({
        imageUrl:    src,
        title:       pickedTitle || null,
        description: getText(descSelector) || null,
        priceText:   [priceSelector ? getText(priceSelector) : '', containerText].filter(Boolean).join(' '),
        scrapedTags: [],
      });
    });

    return results;
  }, {
    imageSelector: config.imageSelector,
    titleSelector: config.titleSelector,
    descSelector:  config.descSelector,
    priceSelector: config.priceSelector,
  }).then(imgs => imgs.map(img => ({
    ...img,
    sourceUrl: pageUrl,
    priceText: extractSeedPrice(img.priceText || '') || img.priceText || null,
  })));
}

/**
 * Scrape a single URL with Playwright.
 */
async function scrapePage(page, url, config, logFn) {
  logFn(`[playwright] Navigating: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    logFn(`[playwright] Navigation failed: ${err.message}`);
    return [];
  }

  await dismissBanners(page);

  // Wait for key content to appear
  if (config.waitFor && config.waitFor !== 'networkidle') {
    try {
      await page.waitForSelector(config.waitFor, { timeout: 8000 });
    } catch {
      logFn(`[playwright] waitFor selector not found: ${config.waitFor}`);
    }
  } else if (config.waitFor === 'networkidle') {
    try {
      await page.waitForLoadState('networkidle', { timeout: 12000 });
    } catch { /* timeout is OK */ }
  }

  if (config.scrollToLoad) {
    await scrollToBottom(page);
  }

  // Extra wait for lazy images to settle
  await page.waitForTimeout(1000);

  const images = await extractImages(page, config, url);
  logFn(`[playwright]   → extracted ${images.length} images`);
  return images;
}

/**
 * Find next-page link in Playwright context.
 */
async function findNextPage(page) {
  return page.evaluate(() => {
    const selectors = [
      'a[rel="next"]',
      '.pagination .next a',
      '.next-page a',
      'a[aria-label="Next page"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.href && el.href !== window.location.href) return el.href;
    }

    // Text-based fallback.
    const links = Array.from(document.querySelectorAll('a[href]'));
    for (const l of links) {
      const txt = (l.textContent || '').trim().toLowerCase();
      if (['next', 'next page', '>', '>>'].includes(txt) && l.href !== window.location.href) {
        return l.href;
      }
    }

    return null;
  });
}

/**
 * Main entry point — runs Playwright against all seed URLs for a site.
 *
 * @param {object}   config     — site config from siteConfigs.js
 * @param {number}   maxPages   — max paginated pages per seed URL
 * @param {Function} logFn      — job log callback
 * @returns {Array}             — all scraped image records
 */
async function runPlaywrightScraper(config, maxPages, logFn = () => {}) {
  let browser;
  const allImages = [];
  const seenUrls  = new Set();
  const followNextPages = config.followNextPages !== false;
  const stopOnEmptyPage = config.stopOnEmptyPage === true;
  let stopAll = false;

  try {
    browser = await chromium.launch({
      headless: true,
      args: BROWSER_ARGS,
    });

    const context = await browser.newContext({
      userAgent:         USER_AGENT,
      viewport:          { width: 1366, height: 768 },
      locale:            'en-IN',
      timezoneId:        'Asia/Kolkata',
      ignoreHTTPSErrors: true,
      // Block unnecessary resources to speed up scraping
      extraHTTPHeaders:  { 'Accept-Language': 'en-IN,en;q=0.9' },
    });

    // Block fonts, media, and tracking scripts — keep images
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['font', 'media', 'websocket'].includes(type)) {
        return route.abort();
      }
      const url = route.request().url();
      if (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook.net') ||
        url.includes('hotjar') ||
        url.includes('intercom')
      ) {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();

    // Mask automation signals
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    for (const seedUrl of config.urls) {
      if (stopAll) break;
      let currentUrl = seedUrl;
      let pageNum    = 0;

      while (currentUrl && pageNum < maxPages) {
        pageNum++;
        logFn(`[playwright] Seed URL page ${pageNum}/${maxPages}`);

        // Rate limit between pages
        if (pageNum > 1) await sleep(config.rateLimitMs ?? 2500);

        const images = await scrapePage(page, currentUrl, config, logFn);

        for (const img of images) {
          if (!seenUrls.has(img.imageUrl)) {
            seenUrls.add(img.imageUrl);
            allImages.push(img);
          }
        }

        if (stopOnEmptyPage && images.length === 0) {
          logFn('[playwright] Empty page detected, stopping further pagination for this source.');
          if (!followNextPages) stopAll = true;
          break;
        }

        currentUrl = followNextPages ? await findNextPage(page) : null;
      }
    }

    await context.close();
  } catch (err) {
    logFn(`[playwright] Browser error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  logFn(`[playwright] Total unique images found: ${allImages.length}`);
  return allImages;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { runPlaywrightScraper };
