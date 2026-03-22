const express = require('express');
const router = express.Router();
const { getHomepageContent } = require('../lib/siteContentStore');

// Public endpoint: homepage cards + games content
router.get('/homepage', async (req, res) => {
  try {
    const content = await getHomepageContent();
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
