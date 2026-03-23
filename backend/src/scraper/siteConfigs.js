// scraper/siteConfigs.js
// ─────────────────────────────────────────────────────────────────────────────
// Per-site scraping configuration. These map to the selectors JSONB column
// in scrape_sources, but are kept in code for version control.
// Admin can override selectors in the DB; code configs are the fallback.
//
// Each config has:
//   urls[]        — seed URLs to start crawling (may contain {page} placeholder)
//   maxPages      — how many paginated pages to scrape per run
//   imageSelector — CSS selector for <img> tags
//   titleSelector — CSS selector for image title/heading
//   descSelector  — CSS selector for description text
//   priceSelector — CSS selector for price text (if available — rare)
//   scraper       — 'playwright' | 'cheerio'
//   waitFor       — (playwright only) selector or 'networkidle' to wait for
//   scrollToLoad  — (playwright only) true if infinite scroll
//   minImageW     — minimum image width in px to consider (filters icons/logos)
// ─────────────────────────────────────────────────────────────────────────────

const SITE_CONFIGS = {

  'https://www.wedmegood.com': {
    scraper: 'playwright',
    urls: [
      'https://www.wedmegood.com/wedding-inspiration/decoration',
      'https://www.wedmegood.com/wedding-inspiration/mehendi-decoration',
      'https://www.wedmegood.com/wedding-inspiration/sangeet-decoration',
      'https://www.wedmegood.com/wedding-inspiration/mandap-decoration',
    ],
    maxPages: 3,
    imageSelector: 'img[src*="cdn"], img[src*="media"], .inspiration-card img, .photo-card img',
    titleSelector: '.card-title, .inspiration-title, h3',
    descSelector:  '.card-desc, .inspiration-desc, p',
    priceSelector: null,
    waitFor:       'networkidle',
    scrollToLoad:  true,
    minImageW:     300,
  },

  'https://www.weddingwire.in': {
    scraper: 'playwright',
    urls: [
      'https://www.weddingwire.in/wedding-ideas/wedding-decoration-ideas--ar2706',
      'https://www.weddingwire.in/wedding-ideas/mandap-decoration--ar8412',
      'https://www.weddingwire.in/wedding-ideas/mehendi-decoration--ar3210',
      'https://www.weddingwire.in/wedding-ideas/reception-decoration--ar5501',
    ],
    maxPages: 2,
    imageSelector: '.gallery-img img, .idea-card img, article img, .photo img',
    titleSelector: '.article-title, h1, h2',
    descSelector:  '.article-body p, .idea-desc',
    priceSelector: null,
    waitFor:       '.gallery-img, article',
    scrollToLoad:  true,
    minImageW:     250,
  },

  'https://www.meragi.com': {
    scraper: 'playwright',
    urls: [
      'https://www.meragi.com/wedding-collections',
      'https://www.meragi.com/decor-packages',
      'https://www.meragi.com/real-weddings',
    ],
    maxPages: 4,
    imageSelector: '.collection-card img, .package-img img, .wedding-photo img, img[loading="lazy"]',
    titleSelector: '.collection-name, .package-title, h2, h3',
    descSelector:  '.collection-desc, .package-detail, p',
    priceSelector: '.price, .package-price, [class*="price"]',
    waitFor:       '.collection-card, .package-img',
    scrollToLoad:  true,
    minImageW:     300,
  },

  'https://www.shaadisaga.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.shaadisaga.com/wedding/decoration',
      'https://www.shaadisaga.com/wedding/mehendi-decoration',
      'https://www.shaadisaga.com/wedding/sangeet-decoration',
      'https://www.shaadisaga.com/wedding/reception-decoration',
    ],
    maxPages: 3,
    imageSelector: '.photo-item img, .gallery-item img, .post-thumbnail img, article img',
    titleSelector: '.post-title, h2.entry-title, .photo-caption',
    descSelector:  '.post-excerpt, .photo-desc, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.weddingz.in': {
    scraper: 'cheerio',
    urls: [
      'https://www.weddingz.in/blog/category/decor/',
      'https://www.weddingz.in/blog/category/mehendi/',
      'https://www.weddingz.in/blog/category/sangeet/',
    ],
    maxPages: 3,
    imageSelector: '.wp-post-image, .blog-img img, .post-thumbnail img, .entry-content img',
    titleSelector: '.entry-title, h1.post-title',
    descSelector:  '.entry-excerpt, .post-content p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.onewed.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.onewed.com/photos/decor/',
      'https://www.onewed.com/photos/mandap/',
      'https://www.onewed.com/photos/reception/',
    ],
    maxPages: 3,
    imageSelector: '.photo-thumb img, .gallery-photo img, .vendor-photo img',
    titleSelector: '.photo-caption, .vendor-name',
    descSelector:  '.photo-desc',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.planthewedding.in': {
    scraper: 'cheerio',
    urls: [
      'https://www.planthewedding.in/decor-ideas/',
      'https://www.planthewedding.in/real-weddings/',
    ],
    maxPages: 3,
    imageSelector: '.post-image img, .blog-image img, article img',
    titleSelector: '.post-title, h2',
    descSelector:  '.post-excerpt, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.weddingsutra.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.weddingsutra.com/galleries/real-weddings/',
      'https://www.weddingsutra.com/galleries/decor/',
      'https://www.weddingsutra.com/galleries/mehendi/',
    ],
    maxPages: 3,
    imageSelector: '.gallery-item img, .photo-wrap img, .item img',
    titleSelector: '.gallery-title, .photo-title, h3',
    descSelector:  '.gallery-desc, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.wedabout.com': {
    scraper: 'playwright',
    urls: [
      'https://www.wedabout.com/real-weddings',
      'https://www.wedabout.com/inspiration/decor',
    ],
    maxPages: 2,
    imageSelector: '.wedding-photo img, .insp-image img, img[class*="photo"]',
    titleSelector: '.wedding-title, h2',
    descSelector:  '.wedding-desc, p',
    priceSelector: null,
    waitFor:       '.wedding-photo, .insp-image',
    scrollToLoad:  true,
    minImageW:     250,
  },

  'https://www.thebigfatindianwedding.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.thebigfatindianwedding.com/category/real-weddings/',
      'https://www.thebigfatindianwedding.com/category/decor/',
    ],
    maxPages: 3,
    imageSelector: '.wp-post-image, .entry-content img, .post-thumbnail img',
    titleSelector: '.entry-title, h1',
    descSelector:  '.entry-content p',
    priceSelector: null,
    minImageW:     300,
  },

  'https://www.bollywoodshaadis.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.bollywoodshaadis.com/articles/celebrity-wedding-decor',
      'https://www.bollywoodshaadis.com/articles/wedding-decoration-ideas',
    ],
    maxPages: 2,
    imageSelector: '.article-img img, .photo-wrap img, .content img',
    titleSelector: '.article-title, h1',
    descSelector:  '.article-desc, p',
    priceSelector: null,
    minImageW:     300,
  },

  'https://www.weddingdoers.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.weddingdoers.com/wedding-decoration-ideas/',
      'https://www.weddingdoers.com/real-weddings/',
    ],
    maxPages: 3,
    imageSelector: '.decoration-photo img, .gallery img, article img',
    titleSelector: '.post-title, h2',
    descSelector:  '.post-excerpt, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.myweddingbazaar.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.myweddingbazaar.com/blog/wedding-decoration/',
    ],
    maxPages: 3,
    imageSelector: '.blog-post-img img, .featured-image img, .content img',
    titleSelector: '.blog-title, h1, h2',
    descSelector:  '.blog-excerpt, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.wednorth.com': {
    scraper: 'cheerio',
    urls: [
      'https://www.wednorth.com/inspiration/decoration/',
      'https://www.wednorth.com/real-weddings/',
    ],
    maxPages: 3,
    imageSelector: '.insp-photo img, .wedding-img img, article img',
    titleSelector: '.insp-title, h2',
    descSelector:  '.insp-desc, p',
    priceSelector: null,
    minImageW:     200,
  },

  'https://www.dreamzcraftweddings.com': {
    scraper: 'playwright',
    urls: [
      'https://www.dreamzcraftweddings.com/gallery/',
      'https://www.dreamzcraftweddings.com/portfolio/',
    ],
    maxPages: 2,
    imageSelector: '.gallery-item img, .portfolio-img img, img[loading="lazy"]',
    titleSelector: '.gallery-caption, .portfolio-title, figcaption',
    descSelector:  '.gallery-desc, p',
    priceSelector: '.starting-price, [class*="price"]',
    waitFor:       '.gallery-item',
    scrollToLoad:  true,
    minImageW:     300,
  },

  'https://www.sabyasachi.com': {
    scraper: 'playwright',
    urls: [
      'https://www.sabyasachi.com/wedding/',
    ],
    maxPages: 1,
    imageSelector: '.wedding-image img, .lookbook-img img, img[src*="wedding"]',
    titleSelector: '.look-title, h2',
    descSelector:  '.look-desc, p',
    priceSelector: null,
    waitFor:       'networkidle',
    scrollToLoad:  true,
    minImageW:     400,
  },

  'https://www.pinterest.com': {
    scraper: 'playwright',
    urls: [
      'https://www.pinterest.com/search/pins/?q=indian+wedding+decor',
      'https://www.pinterest.com/search/pins/?q=mehendi+decoration+india',
      'https://www.pinterest.com/search/pins/?q=sangeet+decoration+india',
      'https://www.pinterest.com/search/pins/?q=indian+wedding+mandap',
      'https://www.pinterest.com/search/pins/?q=reception+decoration+india',
    ],
    maxPages: 1,  // Pinterest requires login for deep scrolling — limited
    imageSelector: 'img[src*="pinimg.com"]',
    titleSelector: '[data-test-id="pinTitle"], .boardTitle',
    descSelector:  '[data-test-id="pin-closeup-description"]',
    priceSelector: null,
    waitFor:       'img[src*="pinimg.com"]',
    scrollToLoad:  true,
    minImageW:     300,
  },

  'https://www.vogue.in': {
    scraper: 'playwright',
    urls: [
      'https://www.vogue.in/weddings/collection/wedding-decor-ideas/',
      'https://www.vogue.in/weddings/collection/real-indian-weddings/',
    ],
    maxPages: 2,
    imageSelector: '.article-body img, .gallery-slide img, figure img',
    titleSelector: 'h1.article-title, h2',
    descSelector:  '.article-body p',
    priceSelector: null,
    waitFor:       '.article-body',
    scrollToLoad:  false,
    minImageW:     400,
  },

  'https://www.bridestoday.in': {
    scraper: 'cheerio',
    urls: [
      'https://www.bridestoday.in/wedding-ideas/decor/',
      'https://www.bridestoday.in/real-weddings/',
    ],
    maxPages: 3,
    imageSelector: '.post-thumbnail img, .article-image img, .content img',
    titleSelector: '.post-title, h1, h2',
    descSelector:  '.post-excerpt, .article-excerpt, p',
    priceSelector: null,
    minImageW:     250,
  },

  'https://www.bridalaffair.in': {
    scraper: 'cheerio',
    urls: [
      'https://www.bridalaffair.in/category/decor/',
      'https://www.bridalaffair.in/category/real-weddings/',
    ],
    maxPages: 3,
    imageSelector: '.post-image img, .gallery-img img, article img',
    titleSelector: '.post-title, h2',
    descSelector:  '.post-excerpt, p',
    priceSelector: null,
    minImageW:     200,
  },
};

module.exports = { SITE_CONFIGS };
