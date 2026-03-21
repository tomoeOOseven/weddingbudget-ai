# 🚀 WeddingBudget.ai - Complete Deployment Guide

**Platforms**: Vercel (Frontend) + Render (Backend)  
**Last Updated**: March 21, 2026

---

## 📋 Pre-Deployment Checklist

Before deploying, ensure you have:

- [ ] GitHub account with repository access
- [ ] Vercel account (https://vercel.com)
- [ ] Render account (https://render.com)
- [ ] Supabase project created and running
- [ ] All environment variables documented
- [ ] Local testing completed successfully

---

## 🔐 Part 1: Secure Your Credentials

### Step 1.1: Rotate API Keys
**Why?** Your .env files contain real API keys that might have been in git history.

1. Go to **Supabase Dashboard**:
   - Settings → API
   - Regenerate both `anon key` and `service role key`
   - Store new values securely

2. Go to **OpenRouter**: 
   - Account → API Keys
   - Regenerate your key
   - Store new value securely

3. Update your local `.env` files with new keys (don't commit!)

### Step 1.2: Configure .gitignore
Verify `.env` files are never committed:
```bash
# Check if .env is in .gitignore
cat .gitignore | grep "\.env"
```

Should show:
```
.env
.env.local
```

---

## 🌐 Part 2: Deploy Backend to Render

### Option A: Deploy Using render.yaml (Recommended)

**Step 2A.1: Push to GitHub**
```bash
cd /path/to/weddingbudget-ai
git add .
git commit -m "Deployment: Add render.yaml and environment configuration"
git push origin main
```

**Step 2A.2: Create New Service on Render**
1. Go to https://render.com/dashboard
2. Click **New +** → **Web Service**
3. Select **Deploy an existing Git repository**
4. Search for your repository: `weddingbudget-ai` (or your repo name)
5. Authorize GitHub if prompted
6. Click **Connect**

**Step 2A.3: Configure Service**
- **Name**: `weddingbudget-ai-backend`
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: Select **Standard** (suitable for production)
- **Region**: Choose closest to your users

**Step 2A.4: Add Environment Variables**
In the **Environment** section, add:

| Key | Value | Secret? |
|-----|-------|---------|
| `NODE_ENV` | `production` | No |
| `PORT` | `4000` | No |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` | No |
| `SUPABASE_URL` | (your Supabase URL) | No |
| `SUPABASE_ANON_KEY` | (your Supabase anon key) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | (your Supabase service role key) | **YES** |
| `OPENROUTER_API_KEY` | (your OpenRouter key) | **YES** |
| `ML_SERVICE_URL` | `http://localhost:8000` | No |

**Step 2A.5: Deploy**
1. Click **Create Web Service**
2. Render starts deploying (takes 2-5 minutes)
3. Wait for ✅ "Live" status
4. Copy the service URL: `https://weddingbudget-ai-backend.onrender.com`

**Render Dashboard URL** will look like: `https://dashboard.render.com/services/web/srv_...`

### Option B: Manual Setup on Render

If render.yaml doesn't work:
1. Follow steps 2A.1 - 2A.4 above, but skip the render.yaml part
2. In service creation, manually configure each setting
3. Build and start commands: same as 2A.3

---

## 🎨 Part 3: Deploy Frontend to Vercel

### Step 3.1: Prepare Repository
```bash
# Ensure frontend/.env has correct backend URL
# Edit frontend/.env:
VITE_API_URL=https://weddingbudget-ai-backend.onrender.com
```

Push changes:
```bash
git add frontend/.env
git commit -m "Frontend: Update backend URL for Vercel deployment"
git push origin main
```

### Step 3.2: Create Vercel Project
1. Go to https://vercel.com/dashboard
2. Click **Add New** → **Project**
3. Select **Import Git Repository**
4. Search for: `weddingbudget-ai`
5. Click **Import**

### Step 3.3: Configure Project
When prompted for project settings:

**1. Select Root Directory**
- Choose `./frontend`

**2. Framework**: 
- Select **Vite**

**3. Build Settings**
- Build Command: `npm run build` ✓ (auto-detected)
- Output Directory: `dist` ✓ (auto-detected)
- Install Command: `npm install` ✓ (auto-detected)

### Step 3.4: Add Environment Variables
Under **Environment Variables**:

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | (your Supabase URL) |
| `VITE_SUPABASE_ANON_KEY` | (your Supabase anon key) |
| `VITE_API_URL` | `https://weddingbudget-ai-backend.onrender.com` |

✅ **Important**: These values are public (they're already visible in frontendcode + browser). Use only the ANON key, never the service role key!

### Step 3.5: Deploy
1. Click **Deploy**
2. Wait for build to complete (2-3 minutes)
3. Get your Vercel URL: `https://weddingbudget-ai.vercel.app`

### Step 3.6: Update Backend CORS
Now that you have your Vercel URL:
1. Go to Render dashboard
2. Select your backend service
3. Go to **Settings** → **Environment**
4. Update `FRONTEND_URL` with your Vercel URL:
   ```
   https://weddingbudget-ai.vercel.app
   ```
5. Click **Save** (service auto-restarts)

---

## ✅ Part 4: Verify Deployment

### Test 1: Backend Health Check
```bash
# Should return: { "status": "ok", "version": "2.0.0", "env": "production" }
curl https://weddingbudget-ai-backend.onrender.com/health
```

### Test 2: Frontend Loads
1. Open https://weddingbudget-ai.vercel.app
2. Should see the WeddingBudget.ai login page
3. No errors in browser console (F12)

### Test 3: API Communication
1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Sign in or start using the app
4. Check requests to `/api/` endpoints:
   - Status should be `200` or `2xx`
   - **NOT** `404` or `5xx`

### Test 4: Full Feature Test
1. Sign up for an account
2. Create a new wedding
3. Go through all steps (estimate, decor, artists, etc.)
4. Check that calculations appear
5. Try exporting/generating report

**If all tests pass**: ✅ Deployment successful!

---

## 🐛 Troubleshooting

### "Backend connection refused"
**Problem**: Frontend can't reach backend  
**Solution**:
1. Verify `VITE_API_URL` in Vercel environment
2. Check Render backend is actually running (`Live` status)
3. Test backend URL in browser (should see health check response)

### "CORS error"
**Problem**: Backend rejecting frontend requests  
**Solution**:
1. Check `FRONTEND_URL` is set correctly in Render
2. Verify it matches exactly (check protocol: `https://`, not `http://`)
3. Restart backend service: Render Dashboard → Service → **Restart**

### "Environment variables not refreshing"
**Problem**: Changed env vars but still seeing old values  
**Solution**:
- **Vercel**: Redeploy by pushing to git or clicking "Redeploy"
- **Render**: Service auto-restarts when env changes
- **Browser**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### "Build failed on Vercel"
**Problem**: Vite build error  
**Solution**:
1. Check Vercel build logs for error details
2. Common issues:
   - Missing `dist/` in `.gitignore` (can cause size issues)
   - Node version mismatch
   - Missing dependencies
3. Try: Update `frontend/vite.config.js` build options if needed

### "502 Bad Gateway" on Render
**Problem**: Backend crashing or taking too long  
**Solution**:
1. Check Render logs: Service → **Logs**
2. Look for error messages
3. Verify all required env vars are set
4. Check Supabase connection
5. Restart service

---

## 📊 Performance Tuning (Optional)

### Frontend - Vercel
- Images are automatically optimized via Vercel's Image Optimization API
- Enable caching in `vercel.json` (already configured)
- Monitor performance: Vercel Dashboard → **Analytics**

### Backend - Render
- Use **Standard** plan for production (minimum recommended)
- **Pro** plan if handling >1000 concurrent users
- Enable **Replica** for auto-scaling if needed
- Monitor: Render Dashboard → Service → **Metrics**

---

## 🔐 Security Checklist (Post-Deployment)

- [ ] All API keys rotated
- [ ] `.env` files NOT in git history
- [ ] `FRONTEND_URL` set in Render
- [ ] Supabase RLS enabled
- [ ] HTTPS enabled (automatic on both platforms)
- [ ] Rate limiting active (Express already configured)
- [ ] Monitor for suspicious activity
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Enable Vercel/Render monitoring/alerts
- [ ] Document all deployment decisions

---

## 📞 Support & Resources

| Issue | Resource |
|-------|----------|
| Vercel deployment | https://vercel.com/docs/frameworks/vite |
| Render deployment | https://render.com/docs |
| Supabase setup | https://supabase.com/docs |
| Vite config | https://vitejs.dev/config/ |

---

## 🎯 Summary

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | https://weddingbudget-ai.vercel.app |
| Backend API | Render | https://weddingbudget-ai-backend.onrender.com |
| Database | Supabase | (managed, no public URL) |

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Status**: ✅ Live / ⏳ Pending / ❌ Failed

---

*Last updated: March 21, 2026*  
*GitHub Copilot - Deployment Assistant*
