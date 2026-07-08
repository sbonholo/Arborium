# Analytics — GoatCounter Setup

Visitor analytics for **arboriumcabins.com**, powered by [GoatCounter](https://www.goatcounter.com/) — a free, privacy-friendly analytics service. No cookies are used, so no cookie-consent banner is required.

## Quick Reference

| | |
|---|---|
| **Dashboard** | https://arboriumcabins.goatcounter.com/ |
| **Site code** | `arboriumcabins` |
| **Account email** | info@arborium.app |
| **Tracking endpoint** | https://arboriumcabins.goatcounter.com/count |
| **Snippet location** | `index.html`, just before `</body>` (bottom of the file) |

## Tracking Snippet

The exact snippet embedded in `index.html`:

```html
<!-- GoatCounter analytics (privacy-friendly, no cookies) -->
<script data-goatcounter="https://arboriumcabins.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```

This is the official GoatCounter embed. It loads their script asynchronously (doesn't slow the page down) and reports each pageview to the `data-goatcounter` endpoint.

## Setup Status (July 2026)

- ✅ Tracking snippet deployed to the live site
- ✅ Endpoint verified working: a pageview beacon from the live arboriumcabins.com hit `https://arboriumcabins.goatcounter.com/count` and returned **HTTP 200**
- ⚠️ **The account email (info@arborium.app) still needs to be verified** — check the inbox for GoatCounter's verification email and click the link. Data may not appear on the dashboard until this is done.

## How to Check Stats

1. Go to https://arboriumcabins.goatcounter.com/
2. Sign in with **info@arborium.app**
3. The dashboard shows pageviews, referrers, visitor locations, browser/device breakdowns, and which pages people visit

## Troubleshooting

**No data showing up?**
- Confirm the account email is verified (see Setup Status above) — unverified accounts may not display data
- Data can take a couple of minutes to appear; refresh the dashboard
- Visit the live site yourself in a normal browser tab and check whether the visit registers

**Your own visits aren't counted?**
- Ad blockers (uBlock Origin, AdGuard, Brave shields, some DNS blockers like Pi-hole) block GoatCounter's script. Your visit simply won't be counted — this also means a portion of real visitors (typically 10–30%) will never show up. The numbers are a reliable trend indicator, not an exact count.
- Test in a private/incognito window with extensions disabled to rule this out

**Verifying the snippet is live:**
- Open arboriumcabins.com, view page source, and search for `goatcounter` — the script tag should be near the bottom, just before `</body>`
- In browser DevTools → Network tab, reload the page and look for a request to `arboriumcabins.goatcounter.com/count` returning status 200

**If the snippet is ever removed accidentally:** re-add the snippet shown above just before the closing `</body>` tag in `index.html`.
