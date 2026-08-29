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

The backend uses the **Google Routes API** to calculate driving distance from the company's location to the project location and determine whether it is within the configured service radius.

The backend is the source of truth for service-area eligibility.

Example configuration:

```env
GOOGLE_MAPS_API_KEY=
COMPANY_ADDRESS=
SERVICE_RADIUS_MILES=
```

Never expose API keys or secrets to the frontend or commit them to Git.

### Backend

Responsible for:

* API endpoints
* Business logic
* Google Routes API calls
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
