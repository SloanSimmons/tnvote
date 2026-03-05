# TNVote – Tennessee Campaign Finance Tracker

See who's funding candidates in your Tennessee district. Powered by public campaign finance data from TNCAMP and SCEC.

## Deploy in 10 minutes

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/tnvote.git
git push -u origin main
```

### 2. Deploy to Vercel
1. Go to https://vercel.com and sign in with GitHub
2. Click "Add New Project"
3. Import your `tnvote` repository
4. Leave all settings as defaults — Vercel auto-detects Vite
5. Click Deploy
6. Your live URL will be something like `tnvote.vercel.app`

That's it. Any future `git push` auto-redeploys.

## Loading data (admin)

Visit your site with `?admin=1` at the end of the URL to reveal the data upload buttons in the bottom-right corner.

- **State data**: Download bulk export from https://apps.tn.gov/tncamp/public/cesearch.htm
- **County data**: Download from https://shelbycountytn.easyvotecampaignfinance.com/

Upload CSV or Excel. Data is stored in the browser (localStorage) — Phase 2 will move this to a shared database so all visitors see the same data.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Roadmap

- [ ] Phase 1: Shelby County + TN state races (current)
- [ ] Phase 2: Shared database (Supabase) so all visitors see live data
- [ ] Phase 3: All TN state races via TNCAMP automation
- [ ] Phase 4: Additional counties
- [ ] Phase 5: Automated data pipeline on report deadlines
