# Trump Mosaic — Complete Deployment Guide

Follow these steps **in order**. Each section tells you exactly what to click,
what to copy, and where to paste it.

---

## Accounts You Need to Create

| Service | Cost | Purpose |
|---|---|---|
| Stripe | Free (2.9% + $0.30/transaction) | Accept credit card payments |
| Supabase | Free up to 500 MB | Database + real-time updates |
| Cloudflare | Free | R2 photo storage (~$1.50/mo for 100 GB) |
| Vercel | Free | Website hosting |
| Namecheap | ~$12/year | Domain name (trumpmosaic.com) |

---

## Step 1 — Register Your Domain

1. Go to **namecheap.com**
2. Search for `trumpmosaic.com` and purchase it (~$12/year)
3. Keep the tab open — you'll need it in Step 5

---

## Step 2 — Set Up Stripe

### Create account
1. Go to **stripe.com → Create account**
2. Fill in your personal and business details
3. Complete identity verification (required to accept live payments)

### Get your API keys
1. In the Stripe Dashboard, click **Developers → API keys**
2. Copy your **Publishable key** (starts with `pk_live_...`)
3. Copy your **Secret key** (starts with `sk_live_...`) — reveal it first
4. Save both — you'll need them in Step 4

> **Test first:** Before going live, start with test keys (`pk_test_...` / `sk_test_...`).
> Use card number `4242 4242 4242 4242`, any future expiry, any CVC.

---

## Step 3 — Set Up Supabase

### Create project
1. Go to **supabase.com → New project**
2. Choose a name (e.g. `trump-mosaic`) and a strong database password
3. Select the region closest to your users (US East is fine)
4. Wait ~2 minutes for the project to provision

### Run the database schema
1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Open the file `supabase-schema.sql` from this repository
3. Paste the entire contents into the SQL editor
4. Click **Run** — you should see "Success. No rows returned"

### Enable Realtime
The schema already adds purchases to the realtime publication.
To confirm: go to **Database → Replication** and verify `purchases` is listed.

### Get your API keys
1. Go to **Project Settings → API**
2. Copy **Project URL** (e.g. `https://xxxxxxxxxxx.supabase.co`)
3. Copy **anon / public** key (starts with `eyJ...`)
4. Copy **service_role** key — click "Reveal" first — this is secret, never expose it publicly

---

## Step 4 — Set Up Cloudflare R2

### Create account
1. Go to **cloudflare.com → Sign up** (free account)

### Create R2 bucket
1. In the Cloudflare dashboard, click **R2** in the left sidebar
2. Click **Create bucket**
3. Name it exactly: `trump-mosaic-photos`
4. Leave all other settings as default → **Create bucket**

### Enable public access (so photos can be displayed)
1. Click your new bucket → **Settings** tab
2. Under **Public access**, click **Allow Access**
3. Copy the **Public bucket URL** (looks like `https://pub-XXXXX.r2.dev`)

### Configure CORS (critical — without this, uploads will fail)
1. In your bucket → **Settings** tab → **CORS Policy**
2. Click **Add CORS policy** and paste this JSON:

```json
[
  {
    "AllowedOrigins": [
      "https://trumpmosaic.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Click **Save**

### Create an API token
1. Go to **R2 → Manage R2 API Tokens**
2. Click **Create API Token**
3. Name: `trump-mosaic-token`
4. Permissions: **Object Read & Write**
5. Specify bucket: `trump-mosaic-photos`
6. Click **Create API Token**
7. Copy and save:
   - **Access Key ID**
   - **Secret Access Key**
   - **Account ID** (shown on the R2 overview page, top right)

---

## Step 5 — Deploy to Vercel

### Connect your repository
1. Go to **vercel.com → Add New Project**
2. Import your GitHub repository (`sbonholo/Arborium`)
3. Set **Root Directory** to `mosaic-site`
4. Framework: **Next.js** (auto-detected)

### Add environment variables
In the Vercel project settings → **Environment Variables**, add each of these:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Added in Step 6 below |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `R2_ACCOUNT_ID` | Cloudflare R2 overview page |
| `R2_ACCESS_KEY_ID` | Created in Step 4 |
| `R2_SECRET_ACCESS_KEY` | Created in Step 4 |
| `R2_BUCKET_NAME` | `trump-mosaic-photos` |
| `R2_PUBLIC_URL` | `https://pub-XXXXX.r2.dev` (from Step 4) |
| `NEXT_PUBLIC_APP_URL` | `https://trumpmosaic.com` |

### Deploy
Click **Deploy**. First deploy takes ~2 minutes.

### Add your domain
1. In Vercel → your project → **Settings → Domains**
2. Add `trumpmosaic.com` and `www.trumpmosaic.com`
3. Vercel will show you two DNS records to add

### Point your domain to Vercel
1. Go back to **Namecheap → Domain List → Manage → Advanced DNS**
2. Add the DNS records Vercel gave you (usually two `A` or `CNAME` records)
3. DNS propagation takes 5–30 minutes

---

## Step 6 — Set Up Stripe Webhook

This is what tells your site "someone just paid."

1. In Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://trumpmosaic.com/api/webhook`
3. **Events to send:** select `checkout.session.completed` only
4. Click **Add endpoint**
5. Click into the new webhook → **Signing secret → Reveal**
6. Copy the `whsec_...` value
7. Add it to Vercel env vars as `STRIPE_WEBHOOK_SECRET`
8. Redeploy Vercel (Settings → Deployments → Redeploy latest)

---

## Step 7 — Test the Full Flow

Do this with **Stripe test keys** before switching to live keys.

1. Open `https://trumpmosaic.com`
2. Click **Claim My Spot** → select Standard ($2) → click **Pay $2 →**
3. On Stripe's checkout page use test card:
   - Card: `4242 4242 4242 4242`
   - Expiry: any future date (e.g. `12/30`)
   - CVC: any 3 digits
4. After payment, you should land on `/success`
5. Wait a few seconds → "Upload your photo" button should appear
6. Upload any selfie
7. Confirm upload → you should see "You're in the portrait!"
8. Go to `https://trumpmosaic.com/mosaic` → your photo should appear

**If the upload button doesn't appear:**
- Check Stripe Dashboard → Webhooks → your endpoint → Recent deliveries
- Look for a `checkout.session.completed` event — if it's red, click it to see the error
- Most common cause: wrong `STRIPE_WEBHOOK_SECRET` in Vercel

**If the upload fails (CORS error):**
- Check your R2 bucket CORS policy (Step 4)
- Make sure `https://trumpmosaic.com` is in `AllowedOrigins`

---

## Step 8 — Go Live

1. In Stripe Dashboard → switch from **Test mode** to **Live mode** (toggle top right)
2. Get live API keys (`pk_live_...` / `sk_live_...`)
3. Update `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in Vercel env vars
4. Add a new live webhook endpoint in Stripe (same URL, same event)
5. Update `STRIPE_WEBHOOK_SECRET` with the live `whsec_...`
6. Redeploy Vercel

---

## Ongoing Costs (at 1,000,000 supporters)

| Item | Monthly cost |
|---|---|
| Vercel hosting | Free (Hobby) or $20/mo (Pro, recommended) |
| Supabase database | Free up to 500 MB, then $25/mo |
| Cloudflare R2 storage (~5 GB) | ~$0.075/mo |
| R2 Class A operations (writes) | $4.50/mo at 1M uploads |
| Domain renewal | ~$1/mo |
| **Stripe fees** (at $2/person) | ~$358,000 total |
| **Your net revenue** | **~$1,642,000** |

---

## Generating the Final Print

When all 1,000,000 spots are filled:

1. Export all photos from R2 (use `aws s3 sync` with R2 endpoint)
2. Use a photomosaic compositor (e.g. **AndreaMosaic**, **Metapixel**, or a custom script)
3. Input: the `trump-portrait.svg` as the target image
4. Input: all 1,000,000 supporter photos as the tile library
5. Output at 13,500 × 18,000 px (300 DPI, 45" × 60")
6. Send to a large-format print shop (e.g. Nations Photo Lab, Bay Photo)
7. Order a museum-quality frame at ~46" × 61" (allows 0.5" border)

Estimated print + frame cost: $500–$1,500 depending on material.

---

## Support

If something doesn't work, check:
1. Vercel function logs: Project → Functions tab → click the failing route
2. Supabase logs: Project → Logs → API
3. Stripe events: Dashboard → Developers → Events
