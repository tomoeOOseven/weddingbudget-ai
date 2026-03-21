# WeddingBudget.ai

AI-powered wedding budget estimator for the Indian high-end wedding market.
Built for the WedTech Innovation Challenge by Events by Athea.

## Architecture

```
weddingbudget-ai/
├── frontend/     React + Vite
├── backend/      Node.js + Express
├── ml_service/   Python + FastAPI + CLIP + GBM
└── database/     Supabase schema + migrations
```

## Quick Start

### 1. Supabase
- Create project at supabase.com
- Enable `vector` extension (Database → Extensions)
- Run `database/schema.sql` in SQL Editor
- Create Storage buckets: `decor-images` (public), `ml-models` (private)
- Invite admin user, run `database/migrations/001_promote_admin.sql`

### 2. Backend
```bash
cd backend && cp .env.example .env  # fill in Supabase + OpenRouter keys
npm install && npm run dev           # http://localhost:4000
```

### 3. Frontend
```bash
cd frontend && cp .env.example .env  # fill in Supabase + API URL
npm install && npm run dev            # http://localhost:5173
```

### 4. ML Service (optional, improves decor cost accuracy)
```bash
cd ml_service && cp .env.example .env
pip install -r requirements.txt
# For CLIP: pip install torch torchvision && pip install git+https://github.com/openai/CLIP.git
uvicorn main:app --port 8000 --reload
```

## 🚀 Production Deployment

To deploy to **Vercel** (frontend) and **Render** (backend):

1. **Read**: [`DEPLOYMENT_QUICK_START.md`](DEPLOYMENT_QUICK_START.md) — Get running in 15 minutes
2. **Detailed**: [`DEPLOYMENT.md`](DEPLOYMENT.md) — Complete step-by-step guide with troubleshooting
3. **Review**: [`DEPLOYMENT_REVIEW.md`](DEPLOYMENT_REVIEW.md) — Security checklist & issues found

**TL;DR:**
- Push to GitHub
- Create Render service from `backend/`, add env vars
- Create Vercel project from `frontend/`, add `VITE_API_URL`
- Update Render's `FRONTEND_URL` after Vercel deploys
- Test all endpoints

## Routes
- `/` — Client budget wizard
- `/login` — Client sign in / sign up
- `/admin/login` — Admin portal
- `/admin` — Dashboard, scraper, labelling, model training, cost data

## Data Pipeline
1. `/admin/scraper` → run scrape on 20 tracked sites
2. `/admin/labelling` → tag images (manual or AI auto-tag via OpenRouter)
3. `/admin/model` → trigger ML training run
4. Client picks decor → ML service predicts cost range live

## All 12 Modules
Smart Input Wizard · Décor Library (AI) · Logistics Engine · Artist Cost Mapper ·
F&B Module · Sundries · Budget Report · PDF Export · Scenario Comparison ·
Budget Tracker · Scraping Pipeline (20 sites) · Admin Labelling UI · ML Training Pipeline ·
Cost Data Management · Audit Log · Client Auth · Row Level Security