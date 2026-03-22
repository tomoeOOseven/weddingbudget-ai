# Deploy (Frontend on Vercel, Backend on Render)

This setup deploys frontend on Vercel and a single backend service on Render.
The backend starts the ML service internally, so no second deployment is required.
Render uses the root `render.yaml` blueprint.

## Services

- `weddingbudget-backend` (Node/Express + embedded ML, from `backend`)

## Frontend (Vercel)

1. Import this repo into Vercel.
2. Set root directory to `frontend`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set frontend env vars in Vercel:
   - `VITE_API_URL` = your Render backend URL (for example `https://weddingbudget-backend-k29m.onrender.com`)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy and copy the Vercel app URL.

## Deploy Steps

1. Push latest code to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Select this repository and branch.
4. Render will detect `render.yaml` and create both services.
5. In `weddingbudget-backend`, set required env vars:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `API_SECRET_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (optional; defaults exist)
   - `OPENROUTER_FALLBACK_MODEL` (optional)
   - `OPENROUTER_SECONDARY_FALLBACK_MODEL` (optional)
   - `OPENROUTER_FOURTH_FALLBACK_MODEL` (optional)
   - `OPENROUTER_FIFTH_FALLBACK_MODEL` (optional)
   - `FRONTEND_URL` (your deployed Vercel frontend URL)
   - `EMBEDDED_ML_SERVICE=1`
   - `ML_SERVICE_URL=http://127.0.0.1:8000`
6. Deploy backend and verify CORS works by opening the Vercel app and testing one API call.

## Health Checks

- Backend: `GET /health`
- Embedded ML service: `GET /api/model/status` (backend checks internal health)

## Notes

- Backend scraper uses Playwright. The Render backend build installs Chromium (`npx playwright install chromium`) and sets `PLAYWRIGHT_BROWSERS_PATH=0`.
- Embedded ML runs CPU-only on Render starter/free plans.
- Backend build installs ML Python dependencies (CPU Torch + CLIP) so visual embeddings are available in production.
- If you use free plans, cold starts can delay first request.
