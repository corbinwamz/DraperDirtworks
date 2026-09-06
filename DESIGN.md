---
name: Draper Dirtworks
description: Licensed excavation & trucking company site — Nampa, Idaho
colors:
  navy: "#002543"
  navy-deep: "#001a30"
  navy-mid: "#2c6690"
  red: "#9e212b"
  red-bright: "#b8323c"
  white: "#ffffff"
  paper: "#f6f4f1"
  line: "#e2ddd4"
  ink: "#1b232c"
  ink-muted: "#4c5866"
  on-navy-muted: "#aebfcd"
typography:
  display:
    fontFamily: "Oswald, Arial Narrow, sans-serif"
    fontSize: "clamp(1.9rem, 1.4rem + 2vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Public Sans, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
rounded:
  sm: "4px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "56px"
  xxl: "88px"
components:
  button-primary:
    backgroundColor: "{colors.red}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "15px 28px"
  button-primary-hover:
    backgroundColor: "{colors.red-bright}"
  button-outline-navy:
    backgroundColor: "transparent"
    textColor: "{colors.navy}"
    rounded: "{rounded.sm}"
    padding: "15px 28px"
  card-service:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "36px 32px"
---

# Design System: Draper Dirtworks

## Overview

**Creative North Star: "The Foreman's Word"**

The site reads like a straight answer from someone whose word is their bond: a licensed local outfit that puts its proof (license, service radius, scope) in front of you before it asks for anything. It is the conventional contractor-site category, played straight and executed at full craft, not reinvented — the user's own explicit choice after seeing three more novel directions (an aerial service-radius map, a jobsite-permit-board system, a technical patent-drawing sheet).

Deep navy carries authority and structure across the largest fields (header, hero, footer, closing CTA band); brick red is spent narrowly, on calls to action and small accents, never as an equal partner to navy. Both colors were sampled directly from the client's own logo artwork, not chosen freehand. The system is deliberately unglamorous: no photography (none exists yet), no invented stats or testimonials, no decorative flourish standing in for content.

Explicitly rejected during direction selection: a flashy/startup register (gradients, glassy cards, playful motion) and a generic templated-contractor look (stock-photo hero, anonymous blue corporate palette).

**Key Characteristics:**
- Navy-dominant, red-disciplined: red never exceeds small accent scale.
- Authored one-stroke line icons stand in for photography; no stock imagery, no emoji-as-icon.
- One authored motion moment (the hero's staggered entrance); no scroll-triggered reveal on every section.
- Condensed uppercase display type for every heading; a plain workhorse sans for body copy.

## Colors

Two brand colors, sampled from the client's logo, govern the palette; everything else is neutral.

### Primary
- **Deep Navy** (#002543): the system's dominant field color. Header background is white, but hero, footer's closing CTA band, and every heading's type color draw from navy. Carries roughly a third to half of any given viewport.
- **Navy Deep** (#001a30): a darker navy reserved for the single closing CTA band, so it reads as the page's last, most emphatic beat rather than a repeat of the hero.

### Secondary
- **Brick Red** (#9e212b): reserved for calls to action, the hero's second headline line, and small accent marks (belief icons, proof-strip icons). Never fills a large field — its rarity is what makes it read as "act now."
- **Red Bright** (#b8323c): the primary button's hover state only.

### Neutral
- **White** (#ffffff): header background, card backgrounds, primary page ground. 
- **Warm Paper** (#f6f4f1): the service-area section only, used to break the white/navy rhythm without introducing a third hue.
- **Hairline** (#e2ddd4): all card borders and dividers.
- **Ink** (#1b232c): body text on light backgrounds.
- **Ink Muted** (#4c5866): secondary/supporting text on light backgrounds.
- **On-Navy Muted** (#aebfcd): secondary text on navy backgrounds — a navy-tinted blue-gray, never plain gray on a colored surface.

### Named Rules
**The Rarity Rule.** Red is a signal, not a field. It appears on buttons, small icon accents, and one headline line — never as a section background or a large fill. The moment red covers more than a control or an accent, it stops meaning "act."

## Typography

**Display Font:** Oswald (with Arial Narrow, sans-serif fallback)
**Body Font:** Public Sans (with Segoe UI, sans-serif fallback)

**Character:** Oswald's condensed, engineered forms carry every heading in uppercase — a deliberate nod to road-sign and equipment-stencil lettering traditions rather than a generic AI-default display face. Public Sans stays quiet and highly legible for body copy, never competing with the display voice.

### Hierarchy
- **Display / H1** (700, `clamp(2.5rem, 1.7rem + 3.2vw, 4.25rem)`, 1.08 line-height, uppercase): hero headline only.
- **Headline / H2** (600, `clamp(1.9rem, 1.4rem + 2vw, 2.75rem)`, 1.08 line-height, uppercase): section headings.
- **Title / H3** (600, ~1.15–1.3rem, uppercase): card and belief headings.
- **Body** (400, 1rem, 1.55 line-height): paragraph copy; section intros cap around 56–68ch measure.
- **Label** (600, ~0.85–0.95rem, uppercase on buttons; sentence case in proof-strip labels): button text and small supporting labels.

### Named Rules
**The All-Caps Display Rule.** Every heading and every button label is uppercase in Oswald. Body copy is never uppercase. This is the one consistent signal that separates "structure" text from "read" text.

## Layout

A single centered container (max-width 1200px, 24px inline padding) holds every section. Vertical rhythm is generous and consistent: 88px of block padding per section on desktop, collapsing to 56px under 720px. Sections alternate ground color to pace the scroll: white → navy (hero) → white (services) → warm paper (service area) → white (beliefs) → deep navy (closing CTA) → warm paper (footer).

Grids are 3-column on desktop (services, beliefs) collapsing to a single column under ~880px; the service-area section is a 2-column split collapsing under 900px. The header is sticky; the mobile nav becomes a full-screen panel below 920px, triggered by a hamburger toggle.

## Elevation & Depth

Mostly flat. Depth is reserved for two moments: the hero's proof strip, which is "docked" at the base of the hero with a lifted shadow to read as a physical card sitting on top of the navy field, and card hover states, which lift slightly with a soft shadow. Nothing else in the system uses shadow.

### Shadow Vocabulary
- **card** (`0 1px 2px rgba(0,21,41,0.06), 0 8px 24px rgba(0,21,41,0.08)`): resting state for buttons and service cards.
- **lift** (`0 4px 10px rgba(0,21,41,0.12), 0 16px 40px rgba(0,21,41,0.14)`): hover state and the hero proof-strip's dock.

### Named Rules
**The Flat-Until-It-Matters Rule.** Shadows appear only on interactive controls (hover) and the one signature "docked" composition. A page with shadows on every card reads as decorated; this system spends depth on purpose.

## Shapes

A single, small corner radius (4px) is used everywhere — buttons, cards, icon badges, the hero proof-strip's top corners. Nothing is fully rounded (no pill buttons, no circular cards) except the small circular belief-icon badges, which are a deliberate exception marking those three items as a distinct "credential" motif. Borders are always 1px and always the hairline neutral color; no colored border accents.

## Components

### Buttons
- **Shape:** 4px radius, 15px/28px padding, uppercase Oswald label.
- **Primary:** red background, white text; hover shifts to the brighter red with a lifted shadow.
- **Outline (navy):** transparent with a navy border/text; hover fills navy with white text. Used on white/paper grounds.
- **Outline (white):** transparent with a white border/text; hover fills white with navy text. Used on navy grounds only.

### Cards (services)
- **Corner style:** 4px radius.
- **Background:** white, 1px hairline border.
- **Shadow strategy:** flat at rest; lifts to the `card` shadow with a navy border on hover.
- **Icon badge:** 56px navy square (4px radius) holding a white 28px line icon.

### Proof Strip (signature component)
A white card docked at the base of the hero, rounded only on its top corners so it reads as sitting flush on the section boundary below. Three items, each an icon + bold label + muted sub-label, divided by hairline rules (vertical on desktop, horizontal stacked on mobile).

### Navigation
Sticky white header; nav links get a red underline that grows in from the left on hover/active. Below 920px, nav collapses into a full-screen white panel with stacked links and the primary CTA button at its foot.

## Do's and Don'ts

### Do:
- **Do** keep red under roughly 10% of any section's visual weight — buttons and small accents only.
- **Do** use the 4px radius everywhere; don't introduce a second radius scale.
- **Do** theme browser chrome (selection, focus ring, scrollbar) from the palette rather than leaving browser defaults.
- **Do** author icons as single-stroke inline SVG in the existing line weight; never substitute an emoji or a different icon grammar.

### Don't:
- **Don't** use a kicker/eyebrow label above any heading — the heading carries its own weight.
- **Don't** add photography that isn't real; the system was deliberately built photo-free until real jobsite photos and video arrive (tracked in PRODUCT.md's Evidence on Hand).
- **Don't** invent stats, testimonials, or credentials beyond what PRODUCT.md confirms (currently: licensed & insured, 15-mile service radius; explicitly no years-in-business or team-size claim yet).
- **Don't** let navy and red share equal billing in a single composition — navy is the field, red is the signal.
