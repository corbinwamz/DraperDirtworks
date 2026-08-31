# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/JS frontend with a small backend (e.g. Node/Express or similar) for API routes — form handling, Google Geocoding API calls, and database operations. User chose this explicitly over a framework.

## Users

Draper Dirtworks serves two roughly equal audiences on the customer side:

- **Homeowners** requesting residential excavation work (driveways, land clearing, drainage, etc.), primarily coming to submit an estimate request.
- **Contractors/commercial clients** sourcing subcontracted excavation work, evaluating capability and reliability before submitting a project.

Both use the same Estimates flow. A third audience uses the Careers page: prospective operators/laborers viewing open positions and submitting applications.

## Product Purpose

A marketing and lead-generation website for a local excavation company. It establishes trust and professionalism, lets prospective customers (residential or commercial) submit project estimate requests, and lets job seekers view openings and apply — with resume upload.

Success means qualified estimate submissions from customers within the service area, and applications from qualified job seekers, without exposing sensitive data (applicant info, API keys) or costing unnecessary API spend.

## Positioning

A local excavation company whose service-area eligibility is determined programmatically: the backend geocodes the submitted project address (Google Geocoding API) and compares straight-line distance from the company's location against a configured service radius, enforced server-side as the source of truth (not user-declared location). The owner has confirmed straight-line distance is acceptable for this business, rather than driving distance.

## Operating Context

- **Estimates workflow:** user submits project info + address → backend geocodes the address (Google Geocoding API, company address geocoded once at startup) → straight-line distance compared against `SERVICE_RADIUS_MILES` → eligibility determined server-side.
- **Careers workflow:** user views open positions → submits application, optionally with a resume upload → data is validated/sanitized server-side and never exposed publicly.
- Company location and service radius are configured via environment variables (`COMPANY_ADDRESS`, `SERVICE_RADIUS_MILES`, `GOOGLE_MAPS_API_KEY`), never hardcoded or exposed to the frontend.

## Capabilities and Constraints

- Backend is the source of truth for service-area eligibility — frontend validation is never trusted alone.
- All application/estimate input must be validated and sanitized server-side.
- Applicant information must never be exposed publicly.
- API keys/secrets must never be exposed to the frontend or committed to git.
- Google Geocoding API usage should be minimized/considered for cost (avoid unnecessary calls); the estimate endpoint is protected from abuse by a Vercel Firewall rate-limit rule.
- Existing structure/functionality should be preserved unless a change is explicitly requested.

## Brand Commitments

- Company name: **Draper Dirtworks**.
- Logo: `Draper Dirtworks Logo.pdf` (in project root).
- Brand colors: red, white, and blue (user-stated, binding).
- Company address: 7325 Airport Rd, Nampa, ID 83687.
- Phone: +1 (208) 407-7948.
- Service radius: 15 miles (drives `SERVICE_RADIUS_MILES` config).
- Tone goals (from existing project instructions): professional, modern, trustworthy construction/excavation aesthetic.
- Visual direction: conventional professional contractor-site layout, played straight at high craft (hero photo, services grid, licensed/insured proof strip, testimonials, direct CTA) rather than a distinctive/experimental visual system — user's explicit choice over more novel directions (aerial service-radius map, jobsite-permit-board, technical-drawing systems) offered during Home page direction selection. Craft bar: strong, professional local-service/contractor sites, judged by the builder's own standard.

## Evidence on Hand

- Logo file provided: `Draper Dirtworks Logo.pdf`.
- Company address, phone number, and service radius confirmed above.
- **Pending:** job site photos and videos are still being gathered by the user and will be added later. Do not fabricate photos, testimonials, licensing/insurance numbers, or project examples in the meantime — use clearly-labeled placeholders until real assets arrive.

## Product Principles

1. Backend is the sole authority for service-area eligibility and data validation — never trust client-side checks.
2. Protect applicant privacy and secrets by default; nothing sensitive reaches the frontend or a public response.
3. Be deliberate with paid API calls (Google Geocoding) — avoid redundant or speculative requests.
4. Preserve working structure/functionality; change only what's explicitly asked for.
5. Never fabricate evidence (photos, testimonials, credentials) — placeholder clearly until real assets land.
