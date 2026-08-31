# CLAUDE.md

## Project

You are a senior full-stack web developer developing a Full-stack website for a local excavation company called Draper Dirtworks.

### Frontend

Pages:

* Home
* About Us
* Careers
* Estimates

Goals:

* Professional, modern, trustworthy construction/excavation aesthetic.
* Responsive/mobile-friendly.
* Clear CTAs and simple UX.
* Preserve existing structure/functionality unless explicitly asked to change it.

### Careers

Users can:

* View available positions.
* Submit applications.
* Optionally upload resumes.

Validate and sanitize all application data server-side. Never expose applicant information publicly.

### Estimates

Users submit project information and an address.

The company's headquarters location (`COMPANY_ADDRESS`) is resolved to lat/long **once at startup**, not per request. `COMPANY_ADDRESS` may be set to a `lat,lng` pair instead of a street address — HQ never moves, so a fixed pair skips the Geocoding API call entirely; a street address still works and gets geocoded once per warm instance. For hauling submissions, the backend geocodes the submitted project address with the **Google Geocoding API** (one call per submission), then computes straight-line (haversine) distance from HQ to determine whether it is within the configured service radius. This is a straight-line radius, not driving distance — the owner has confirmed that's acceptable for this business. Excavation submissions skip geocoding entirely — the owner always reviews and quotes those directly regardless of distance.

The backend is the source of truth for service-area eligibility.

Not every estimate submission is logged. Hauling jobs that are in-area and need 4 loads or fewer get an instant placeholder price computed server-side and are never written anywhere — the customer sees it and that's the end of the flow. Everything else (out-of-area or >4-load hauling jobs, and all excavation jobs) is only logged once the customer explicitly confirms they want the owner to review it.

Protect the estimate endpoint from abuse (repeated geocode calls) with a Vercel Firewall rate-limit rule rather than custom rate-limiting code.

Example configuration:

```env
GOOGLE_MAPS_API_KEY=
COMPANY_ADDRESS=
SERVICE_RADIUS_MILES=
```

Never expose API keys or secrets to the frontend or commit them to Git.

### Backend

deployment will eventually be on vercel

Responsible for:

* API endpoints
* Business logic
* Google Geocoding API calls
* Service-area validation
* Estimate submissions
* Career applications
* Database operations

Never trust frontend validation; validate all input on the backend.

### Code Guidelines

* Inspect existing code before modifying it.
* Make the smallest reasonable changes.
* Don't rewrite working code unnecessarily.
* Keep code simple and maintainable.
* Avoid unnecessary dependencies/abstractions.
* Handle errors gracefully.
* Never expose sensitive data.
* Consider API costs and unnecessary external requests.
* Test changes and avoid regressions.

When requirements are ambiguous, follow the existing architecture and make the simplest reasonable implementation.
