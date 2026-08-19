# Going public + sidebar ads

The app is a static Vite/React site with no backend — everything (jar parsing, voxelization,
export) already runs entirely in the browser, so "going public" just means hosting the static
build somewhere. Ads are wired in but fully inert until you have real AdSense IDs: with no env
vars set, the site looks and behaves exactly as it does locally today.

## What I can't do for you

I can't create accounts, apply for AdSense, or enter payment/tax details on your behalf. Those
steps below are yours. Everything else (code, layout, docs) is already done.

## 1. Push the code to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
```

Create a repo at [github.com/new](https://github.com/new), then:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. Deploy to Vercel

1. Sign up / log in at [vercel.com](https://vercel.com) (GitHub login is easiest).
2. "Add New… → Project", import the repo you just pushed.
3. Vercel auto-detects Vite (build command `npm run build`, output `dist`) — leave defaults.
4. Deploy. You get a free `your-app.vercel.app` URL immediately. A custom domain can be attached
   later under Project Settings → Domains, no code changes needed.

The site is now public, with an empty margin on wide screens where the ad rails will appear once
enabled, and a Privacy Policy link in the footer.

## 3. Apply for Google AdSense

1. Go to [adsense.google.com](https://www.google.com/adsense/start/) and sign up, using your live
   Vercel URL as the site.
2. AdSense reviews the site before approving it — it checks for real, navigable content and a
   privacy policy (already live at `/privacy.html`). Approval commonly takes anywhere from a day to
   a couple of weeks; there's nothing to do but wait once you've applied.
3. While waiting, don't test with an actual ad blocker enabled if you want to sanity-check the
   layout — ad blockers hide the rails, which is expected, not a bug.

## 4. Once approved: turn the ads on

1. In AdSense, create an ad unit (a "Display ad", vertical/skyscraper works well for a side rail)
   and note two values: your **publisher ID** (`ca-pub-XXXXXXXXXXXXXXXX`) and the new unit's
   **slot ID** (a numeric string).
2. In Vercel: Project Settings → Environment Variables, add:
   - `VITE_ADSENSE_CLIENT_ID` = your publisher ID
   - `VITE_ADSENSE_SIDE_RAIL_SLOT` = the slot ID
3. Redeploy (Vercel → Deployments → Redeploy, or just push any commit). The side rails will start
   rendering real ads on screens `lg` and wider; mobile stays ad-free (no room for a side rail
   there).
4. AdSense will also give you one line to add to a `public/ads.txt` file, e.g.:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
   Create `public/ads.txt` with your real line (not the placeholder above) and redeploy — this
   file doesn't exist yet since it needs your actual publisher ID.

## Later, if you ever want a paid tier too

A subscription/paywall approach (Clerk + Stripe gating premium modes) was explored and then fully
reverted this session — the user hadn't decided on it. If you want to revisit that later, it's a
separate decision from the ads work here, not something this plan assumes.
