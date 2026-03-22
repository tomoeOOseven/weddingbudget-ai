require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const { startEmbeddedMlService } = require('./lib/mlBootstrap');

const app  = express();
const PORT = process.env.PORT || 4000;

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const localOrigins = ['http://localhost:5173', 'http://localhost:3000'];
const trustedOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)?weddingbudget\.ai$/i,
];
const allowedOrigins = [
  ...configuredOrigins,
  ...(process.env.NODE_ENV === 'production' ? [] : localOrigins),
];

// Trust the first proxy (Render, Vercel, etc.)
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (health checks, server-to-server).
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (trustedOriginPatterns.some((re) => re.test(origin))) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '4mb' }));
app.use('/api/', rateLimit({ windowMs: 60000, max: 200, message: { error: 'Too many requests' } }));

app.use('/api/data',       require('./routes/data'));
app.use('/api/estimate',   require('./routes/estimate'));
app.use('/api/decor',      require('./routes/decor'));
app.use('/api/artists',    require('./routes/artists'));
app.use('/api/fb',         require('./routes/fb'));
app.use('/api/logistics',  require('./routes/logistics'));
app.use('/api/report',     require('./routes/report'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/scraper',    require('./routes/scraper'));
app.use('/api/labelling',  require('./routes/labelling'));
app.use('/api/model',      require('./routes/model'));
app.use('/api/weddings',   require('./routes/weddings'));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', env: process.env.NODE_ENV }));
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const mlChild = startEmbeddedMlService();

function shutdown() {
  if (mlChild && !mlChild.killed) {
    mlChild.kill();
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen(PORT, () => {
  console.log(`\n🌸 WeddingBudget.ai API v2 running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
  if (mlChild) {
    console.log('   Embedded ML service mode: enabled');
  }
});