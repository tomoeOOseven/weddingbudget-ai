// scraper/siteConfigs.js
// Configs focused on the requested wedding decor sources.
// These are fallback defaults when DB selectors are not provided.

const SITE_CONFIGS = {
  'https://www.weddingwire.in/wedding-venues': {
    scraper: 'playwright',
    urls: ['https://www.weddingwire.in/wedding-venues'],
    maxPages: 2,
    imageSelector: 'article img, [class*="vendor"] img, [class*="storefront"] img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="description"], [class*="snippet"]',
    priceSelector: '[class*="price"], [class*="starting"], [class*="budget"]',
    waitFor: 'article, [class*="vendor"]',
    scrollToLoad: true,
    minImageW: 240,
  },

  'https://www.weddingbazaar.com/wedding-decorators': {
    scraper: 'cheerio',
    urls: ['https://www.weddingbazaar.com/wedding-decorators'],
    maxPages: 3,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, h4, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="summary"]',
    priceSelector: '[class*="price"], [class*="starting"], [class*="budget"]',
    minImageW: 220,
  },

  'https://www.wedmegood.com/vendors/all/wedding-decorators/': {
    scraper: 'cheerio',
    urls: ['https://www.wedmegood.com/vendors/all/wedding-decorators/'],
    maxPages: 4,
    imageSelector: 'a[href*="/profile/"] img, [class*="vendor"] img',
    titleSelector: 'h2, h3, h4, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="location"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    minImageW: 220,
  },

  'https://weddingsutra.com/wedding-vendors/wedding-decor/': {
    scraper: 'cheerio',
    urls: ['https://weddingsutra.com/wedding-vendors/wedding-decor/'],
    maxPages: 3,
    imageSelector: 'article img, [class*="vendor"] img, [class*="listing"] img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="meta"]',
    priceSelector: '[class*="price"], [class*="starting"], [class*="budget"]',
    minImageW: 220,
  },

  'https://www.wedmegood.com/photos/wedding-decoration-ideas': {
    scraper: 'playwright',
    urls: ['https://www.wedmegood.com/photos/wedding-decoration-ideas'],
    maxPages: 2,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="caption"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    waitFor: 'img',
    scrollToLoad: true,
    minImageW: 240,
  },

  'https://unsplash.com/s/photos/indian-wedding-decor': {
    scraper: 'playwright',
    urls: ['https://unsplash.com/s/photos/indian-wedding-decor'],
    maxPages: 1,
    imageSelector: 'figure img, img[srcset], img[src*="images.unsplash.com"]',
    titleSelector: 'h1, h2, [data-test*="title"], figcaption',
    descSelector: 'figcaption, p',
    priceSelector: null,
    waitFor: 'img[srcset], figure',
    scrollToLoad: true,
    minImageW: 260,
  },

  'https://www.shaadibaraati.com/vendors/all/planning-and-decoration/wedding-decorators': {
    scraper: 'cheerio',
    urls: ['https://www.shaadibaraati.com/vendors/all/planning-and-decoration/wedding-decorators'],
    maxPages: 3,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, h4, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="location"]',
    priceSelector: '[class*="price"], [class*="starting"], [class*="budget"]',
    minImageW: 220,
  },

  // Domain-level fallbacks so base URLs under same domain still get usable defaults.
  'https://www.weddingwire.in': {
    scraper: 'playwright',
    urls: ['https://www.weddingwire.in/wedding-venues'],
    maxPages: 2,
    imageSelector: 'article img, [class*="vendor"] img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="description"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    waitFor: 'article, [class*="vendor"]',
    scrollToLoad: true,
    minImageW: 240,
  },

  'https://www.weddingbazaar.com': {
    scraper: 'cheerio',
    urls: ['https://www.weddingbazaar.com/wedding-decorators'],
    maxPages: 3,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    minImageW: 220,
  },

  'https://www.wedmegood.com': {
    scraper: 'playwright',
    urls: [
      'https://www.wedmegood.com/vendors/all/wedding-decorators/',
      'https://www.wedmegood.com/photos/wedding-decoration-ideas',
    ],
    maxPages: 3,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, h4, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="caption"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    waitFor: 'img',
    scrollToLoad: true,
    minImageW: 220,
  },

  'https://weddingsutra.com': {
    scraper: 'cheerio',
    urls: ['https://weddingsutra.com/wedding-vendors/wedding-decor/'],
    maxPages: 3,
    imageSelector: 'article img, [class*="vendor"] img',
    titleSelector: 'h1, h2, h3, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    minImageW: 220,
  },

  'https://unsplash.com': {
    scraper: 'playwright',
    urls: ['https://unsplash.com/s/photos/indian-wedding-decor'],
    maxPages: 1,
    imageSelector: 'figure img, img[srcset], img[src*="images.unsplash.com"]',
    titleSelector: 'h1, h2, figcaption',
    descSelector: 'figcaption, p',
    priceSelector: null,
    waitFor: 'figure, img[srcset]',
    scrollToLoad: true,
    minImageW: 260,
  },

  'https://www.shaadibaraati.com': {
    scraper: 'cheerio',
    urls: ['https://www.shaadibaraati.com/vendors/all/planning-and-decoration/wedding-decorators'],
    maxPages: 3,
    imageSelector: 'img',
    titleSelector: 'h1, h2, h3, h4, [class*="title"], [class*="name"]',
    descSelector: 'p, [class*="desc"], [class*="location"]',
    priceSelector: '[class*="price"], [class*="starting"]',
    minImageW: 220,
  },
};

module.exports = { SITE_CONFIGS };
