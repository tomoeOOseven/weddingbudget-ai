# Deploy (Frontend on Vercel, Backend + ML on Render)

This setup deploys frontend on Vercel and backend + ML service on Render.
Render uses the root `render.yaml` blueprint.

## Services

- `weddingbudget-backend` (Node/Express, from `backend`)
- `weddingbudget-ml-service` (FastAPI, from `ml_service`)

## Frontend (Vercel)

1. Import this repo into Vercel.
2. Set root directory to `frontend`.
3. Build command: `npm run build`
4. Output directory: `dist`
5. Set frontend env vars in Vercel:
   - `VITE_API_URL` = your Render backend URL (for example `https://weddingbudget-backend.onrender.com`)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy and copy the Vercel app URL.

## Deploy Steps

1. Push latest code to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Select this repository and branch.
4. Render will detect `render.yaml` and create both services.
5. In `weddingbudget-ml-service`, set required env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Deploy the ML service first and copy its URL.
7. In `weddingbudget-backend`, set required env vars:
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
   - `ML_SERVICE_URL` = URL of `weddingbudget-ml-service`
8. Redeploy backend after setting `ML_SERVICE_URL`.
9. Verify backend CORS works by opening the Vercel app and testing one API call.

## Health Checks

- Backend: `GET /health`
- ML service: `GET /health`

## Notes

- Backend scraper uses Playwright. The Render backend build installs Chromium (`npx playwright install chromium`) and sets `PLAYWRIGHT_BROWSERS_PATH=0`.
- `ml_service` runs CPU-only on Render starter/free plans.
- The ML service loads optional CLIP only if Torch/CLIP is available.
- If you use free plans, cold starts can delay first request.
