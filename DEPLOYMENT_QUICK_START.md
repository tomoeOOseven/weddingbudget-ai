# Quick Deployment Checklist

**Time to Deploy**: ~15 minutes  
**Platforms**: Vercel + Render

## ⚡ 60-Second TL;DR

```bash
# 1. Update backend env
FRONTEND_URL=https://your-frontend.vercel.app
ML_SERVICE_URL=https://your-ml-service.com

# 2. Push to GitHub
git push origin main

# 3. Deploy Backend → Render (https://render.com)
# - Import repo, select backend folder
# - Add env vars from backend/.env.example
# - Deploy

# 4. Get backend URL: https://xxx.onrender.com

# 5. Deploy Frontend → Vercel (https://vercel.com)
# - Import repo, select frontend folder  
# - Add VITE_API_URL=https://xxx.onrender.com
# - Deploy

# 6. Update backend FRONTEND_URL with Vercel URL
# 7. Test at https://your-app.vercel.app
```

---

## 📝 Full Checklist

### Before Deployment
- [ ] All `.env` files use `.env.example` template
- [ ] API keys rotated (Supabase + OpenRouter)
- [ ] `.gitignore` includes `.env` files
- [ ] Local testing passes all steps

### Backend (Render)
- [ ] Push to GitHub
- [ ] Render service created
- [ ] Environment variables set:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `OPENROUTER_API_KEY`
  - [ ] `FRONTEND_URL` (update after frontend deployed)
- [ ] Service deployed and "Live"
- [ ] Backend URL copied (e.g., `https://xxx.onrender.com`)

### Frontend (Vercel)
- [ ] Push to GitHub (already pushed above)
- [ ] Vercel project created
- [ ] Environment variables set:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_API_URL` = (Backend URL from above)
- [ ] Project deployed and "Ready"
- [ ] Vercel URL copied (e.g., `https://xxx.vercel.app`)

### Post-Deployment
- [ ] Update Render `FRONTEND_URL` with Vercel URL
- [ ] Test backend health: `/health` endpoint
- [ ] Test frontend loads
- [ ] Test API calls (F12 → Network tab)
- [ ] Test full flow: Sign up → Create wedding → Calculate
- [ ] Monitor error logs for 24 hours

---

## 🔗 Important URLs to Note

```
Frontend URL:  https://___________
Backend URL:   https://___________
Supabase:      https://___________
```

---

## 🚨 Common Mistakes (Avoid These!)

❌ Setting `VITE_API_URL=http://localhost:4000` in Vercel  
✅ Set to your Render backend URL

❌ Forgetting to set `FRONTEND_URL` in Render  
✅ Will cause CORS errors

❌ Committing `.env` files to git  
✅ Always use `.env.example` and add to `.gitignore`

❌ Using `SUPABASE_SERVICE_ROLE_KEY` in frontend  
✅ Only use `VITE_SUPABASE_ANON_KEY` in frontend

---

## 📞 When Things Go Wrong

1. Check logs:
   - Vercel: Dashboard → Deployments → Logs
   - Render: Dashboard → Service → Logs

2. Verify environment variables are set

3. Test each component individually:
   - Backend: `curl https://xxx.onrender.com/health`
   - Frontend: Open in browser, check console (F12)

4. Common fixes:
   - Hard refresh browser (Ctrl+Shift+R)
   - Restart Render service
   - Redeploy Vercel

See `DEPLOYMENT.md` for detailed troubleshooting.

---

**Status**: ✅ Ready to Deploy
