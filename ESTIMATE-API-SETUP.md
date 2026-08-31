# Estimate API Setup Checklist

Steps to finish wiring up `api/estimate.js` before the "Get an Estimate" form works end-to-end. Nothing here is done by editing code in this repo — these are Google Cloud, Google Sheets, and Vercel dashboard steps.

## 1. Google Maps Platform

- [ ] Enable the **Geocoding API** on the Google Cloud project tied to your Maps API key.
- [ ] Create (or reuse) an API key restricted to the Geocoding API only (API restrictions, not IP restrictions — Vercel functions use dynamic outbound IPs by default, and a static egress IP is a $100/mo/project Pro+ add-on, not worth it here).
- [ ] Set a daily quota cap on the key in Google Cloud Console (Quotas & System Limits) as a cost backstop — a few hundred requests/day is far more than this site needs, but caps damage if the key ever leaks.
- [ ] Confirm billing is enabled on that Google Cloud project (Geocoding API requires it, even within the free monthly credit).

## 2. Environment variables

Add these to **both** local `.env` and the Vercel project's Environment Variables settings (Production + Preview):

- [ ] `GOOGLE_MAPS_API_KEY` — the key from step 1.
- [ ] `COMPANY_ADDRESS` — Draper Dirtworks HQ. Either a street address (e.g. `7325 Airport Rd, Nampa, ID 83687`, geocoded once per warm instance) or a `lat,lng` pair (e.g. `43.5407,-116.5635`, skips the Geocoding API call entirely since HQ never moves — the cheaper option).
- [ ] `SERVICE_RADIUS_MILES` — `15` per current spec.

(Placeholders already added to `.env.example`.)

## 3. Google Sheet

`api/estimate.js` appends rows to a tab named exactly **`Estimates`** in the same spreadsheet as the existing `Applications` tab (`SPREADSHEET_ID`).

**Not every submission reaches the sheet.** Only rows that need the owner's manual review are written:

- **Hauling**, in-area (≤15 mi) **and** ≤4 loads → never written. The customer gets an instant placeholder price on the page and that's it.
- **Hauling**, out-of-area or >4 loads → written only after the customer sees a "needs review" prompt and explicitly clicks **Submit For Review**.
- **Excavation** → always written once the address is verified (its copy has always promised an owner callback regardless of distance). The address must still successfully geocode — an address the Geocoding API can't find is rejected with a "Could not verify that address" error, same as hauling — but the resulting distance never gates eligibility, it's only recorded in `Distance (mi)` for the owner's reference.

- [ ] Create an `Estimates` tab in that spreadsheet.
- [ ] Add header row matching the column order the code writes:

  | Status | Timestamp | Type | Name | Phone | Email | Material | Amount | Unit | Project Type | Service | Address | Distance (mi) | Message | Quote |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

  `Quote` defaults to `N/A` on every new row; the owner overwrites it by hand once a job is reviewed.

- [ ] Confirm the service account in `GOOGLE_SERVICE_ACCOUNT_KEY` has edit access to this spreadsheet (it already does, since `Applications` works).

## 3a. Placeholder pricing formula

`api/estimate.js` has a `PLACEHOLDER_RATE_PER_UNIT` constant (`{ loads: 150, yards: 45, tons: 35 }`) used only for in-area, ≤4-load hauling jobs, feeding `calculatePlaceholderEstimate()`. These numbers are made up — swap them (or replace the function entirely) once you have real per-unit rates.

## 4. Vercel Firewall rate limiting

Protects `/api/estimate` from repeated/scripted submissions burning Geocoding API quota. Configured in the Vercel dashboard, not in code:

- [ ] Project → **Firewall** → **Configure** → **+ New Rule**.
- [ ] Condition: request path is `/api/estimate`.
- [ ] Action: **Rate Limit** — start with something like 5 requests per 10 minutes per IP (Fixed Window algorithm; Hobby plan supports this).
- [ ] Action on limit hit: **Deny** (or **Log** first for a few days to see real traffic before enforcing).
- [ ] Publish the rule.
- [ ] Note: Hobby plan includes 1,000,000 allowed rate-limited requests/month free — a local business site won't come close to that.

## 5. End-to-end test

- [ ] Submit the hauling form with a real nearby address and ≤4 loads → should show the **instant estimate** panel with a placeholder dollar amount, form hides, **no row written** to the sheet.
- [ ] Submit the hauling form with an address >15 miles away → should show the "outside our 15-mile service area" review prompt; clicking **Submit For Review** writes a row and shows the normal "Request Received" success panel; clicking **Go Back & Edit** returns to the form with nothing submitted.
- [ ] Submit the hauling form in-area but with >4 loads → should show the ">4 loads needs a closer look" review prompt with the same confirm/cancel behavior.
- [ ] Submit the hauling form with a garbage/nonexistent address → should show the "We couldn't find that address" error on the form, form stays visible with all previously entered values intact, no row written.
- [ ] Submit the excavation form with a real address and confirm its row appears, with `Material`/`Amount`/`Unit` blank and `Project Type`/`Service`/`Distance (mi)` filled in. Selecting "Other" for Service should write `Other: <their text>` to the `Service` column.
- [ ] Submit the excavation form with a garbage/nonexistent address → should show the same "We couldn't find that address" error on the form, form stays visible with all previously entered values intact, no row written.
- [ ] Check Vercel function logs for any geocoding or Sheets errors.
