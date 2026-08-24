> Original handoff spec, 2026-08-22. Implemented on `feat/ui-polish` with deviations: Direction B composition, Routes as status list, Avenir Next/Nunito Sans instead of Geist, CVD-checked route palette, neutral PDF badge, theme "Saffron Signal".
> The accompanying `.dc.html` design reference was not committed; the live design canvas is linked from the PR.
> Paths below are relative to the repo root.

# Handoff: Humphreys Transit Planner — shadcn-style UI redesign

## Overview
Full visual redesign of the existing Humphreys Transit Planner (mobile-first React SPA, single-file `src/App.jsx`) onto a shadcn/ui-style token system:
- **Style:** Vega (classic shadcn) — flat 1px borders, subtle shadows, no glows, no colored card rails
- **Radius:** Medium (8px controls, 12px cards, 999px pills)
- **Theme:** Light is the default; Dark ships as a token swap. Same components, different CSS-variable values
- Route colors (Blue/Green/Purple/Gold/…) are **data, not theme** — they appear only in badges and dots and are identical in both themes
- MAPA (official app) pointer moves out of content cards into the page footer; the first-run dialog keeps the disclaimer but has **no store buttons** (only "I understand — continue")

## About the Design Files
The design reference was a static HTML prototype (`Shadcn UI Directions.dc.html`, uncommitted — see the canvas linked from the PR) showing intended look, spacing, and copy. It was not production code. The task is to **recreate these screens inside the existing codebase** (`src/App.jsx`, React + inline styles + the `CSS` template string), keeping all current logic (`findTrips`, `nextDepartureInfo`, i18n `STRINGS`, localStorage hooks) untouched. This is a reskin, not a rewrite.

Open the file in a browser and use these screen ids (badges on the canvas):
- `2a` Plan (empty) · `2b` Plan (results) · `2c` No-trips state · `2d` Stop search dropdown · `2e` Now tab · `2f` Routes list · `2g` Route detail · `2h` Off-Post · `2i` First-run dialog · `2j` Korean locale · `2k` Dark theme · `2l` Token map · `3a` Appearance settings (optional, phase 2)

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii, and copy in screens 2a–2l are final. Recreate pixel-close using the codebase's existing inline-style approach. (Turn-1 and Turn-3 Nova/Maia/Lyra sections in the same file are explorations — ignore them for implementation.)

## Design Tokens

Replace the current `C` palette const with a two-theme token object. Components must reference tokens only — never hardcoded surfaces.

### Light (default)
| Token | Value | Used for |
| --- | --- | --- |
| `background` | `#fafafa` | page background |
| `card` | `#ffffff` | cards, header bar, dropdown |
| `border` | `#e4e4e7` | card/input borders |
| `borderStrong` | `#d4d4d8` | fastest-trip card border |
| `divider` | `#f4f4f5` | row dividers inside cards |
| `muted` | `#f4f4f5` | tab-list track, info notes, segmented track |
| `foreground` | `#09090b` | headings, primary text |
| `body` | `#3f3f46` | leg/body text |
| `secondary` | `#52525b` | note text |
| `mutedFg` | `#71717a` | metadata, inactive tabs |
| `faint` | `#a1a1aa` | placeholders, footnotes, chevrons |
| `primary` | `#18181b` (text `#fafafa`) | Find routes button, Fastest badge, active EN/KO |
| `link` | `#0891b2` (hover `#0e7490`) | links |
| `focusBorder` | `#a1a1aa` + ring `0 0 0 3px rgba(9,9,11,0.08)` | focused input |
| `warnBg/warnBorder/warnText` | `#fffbeb` / `#fde68a` / `#92400e` | Off-Post warning banner |
| `pdfBg/pdfBorder/pdfText` | `#fdf6dd` / `#d9c25c` / `#8a6d00` | PDF-sourced badge |
| `originDot` | `#16a34a` | From-field dot |
| `cardShadow` | `0 1px 2px rgba(0,0,0,0.05)`; fastest card `0 1px 3px rgba(0,0,0,0.07)` | |

### Dark
| Token | Value |
| --- | --- |
| `background` | `#09090b` |
| `card` | `#111113` |
| `border` | `#27272a` · `borderStrong` `#3f3f46` · `divider` `#27272a` |
| `muted` | `#27272a` |
| `foreground` | `#fafafa` · `body` `#d4d4d8` · `mutedFg` `#a1a1aa` · `faint` `#71717a` |
| `primary` | `#fafafa` (text `#18181b`) |
| `pdfBorder/pdfText` | `#8a6d00` / `#FFD040` (transparent bg) |
| shadows | none (borders carry hierarchy) |

### Route colors (theme-independent, keep existing `ROUTES[..].color`)
Badge = filled pill, `border-radius:999px`, font 700, 10.5–11px:
| Route | Fill | Badge text |
| --- | --- | --- |
| Blue | `#5bb8ff` | `#0c3a5e` |
| Black | `#8090a0` | `#ffffff` |
| Green | `#4dde88` | `#0b3d22` |
| Orange | `#ff8c3a` | `#5e2503` |
| Purple | `#c47aff` | `#ffffff` |
| Gold | `#FFD040` | `#5e4a00` |
| Brown | `#e8944a` | `#4b2506` |
| Pink | `#ff6bb5` | `#ffffff` |

Inline colored route *text* on light: Purple `#9333ea`, Green `#15803d` (darkened for AA). On dark, raw route colors are fine as text.

### Radius scale (Medium)
8px inputs/buttons/segmented, 12px cards, 7px active tab, 6px small badges, 999px pills/chips. Phone-frame outer chrome is not part of the app.

### Spacing
Card padding 16px (14–16px list rows), page gutter 20px, vertical rhythm gap 12–14px between stacked cards, 8px between form fields.

### Typography
- **Sans:** Geist 400/500/600/700 → falls back `'Noto Sans KR', sans-serif` (KO text always Noto Sans KR)
- **Mono (times only):** Geist Mono 500/600
- Scale: 11px footnotes · 11.5–12px metadata · 13px labels/body/buttons-small · 14px inputs & list rows · 15–16px header title (600) · 17px page titles · trip times 21–24px mono 600, `letter-spacing:-0.02em`
- **No uppercase-letterspaced micro-text** except the 11px/600/+0.5px section label in the route-detail schedule note
- **Fonts must be self-hosted** in `public/fonts/` like the existing Rajdhani/JetBrains Mono (no Google CDN — keep the CSP posture). Download Geist + Geist Mono woff2, add `@font-face` in `public/fonts/fonts.css`, remove Rajdhani. Acceptable fallback: keep JetBrains Mono as the mono face if you'd rather not add Geist Mono.

## Screens / Views

### Header (all tabs) — replaces gradient header, bus-emoji logo, route-color strip
- Card-background bar, 1px bottom border, padding `16px 20px 14px`
- Left: title 15px/600 "Humphreys Transit Planner", subtitle 11.5px mutedFg "Community shuttle planner · Pyeongtaek" (no uppercase, no letter-spacing)
- Right: EN/한국어 segmented — muted track radius 8, active segment card-bg with `0 1px 2px rgba(0,0,0,0.08)` (dark: active `#3f3f46`), 11px/600
- Below: tab bar (shadcn Tabs) — muted track radius 10 padding 4, four equal tabs 13px, active = card bg + shadow + radius 7 + 600, inactive mutedFg/500. **Plain text labels — no emoji.** Delete the route-color strip.

### 2a Plan (empty)
Order: Favorites chips → Recent chips → "Plan a trip" card → building-numbers info note → footer.
- Chip: white pill, 1px border, `5px 12px`, 12px; star `#71717a`; remove-× only on press/hover
- Plan card: 13px/600 title row + ghost buttons "Nearest", "★ Save" (1px border, 11px/500, `3px 9px`, radius 6)
- Inputs: 1px border radius 8, `10px 12px`, 14px; left status dot 8px (From = round `originDot` green; To = 2px-radius square `foreground`); placeholder = `faint`
- Swap: keep existing ⇅ behavior as small ghost icon-button between fields
- When segmented: muted track radius 8, 12px labels, active card-bg pill; Depart/Arrive reveal existing date+time pickers restyled to the same input spec
- Primary button: full-width, `padding:11px 0`, radius 8, 14px/600, `primary` bg; **disabled = same bg at 45% opacity** (not gray)
- Info note: muted bg (no border) radius 10, 12px secondary text
- Footer: top border, centered 11px `faint`: disclaimer + "Official app: **MAPA (My Army Post App)** — App Store · Google Play" as `link`-colored anchors. **Delete the `MapaCard` component from the Plan tab.**

### 2b Plan (results)
- Form collapses to a summary card: route pair 13px/600 ellipsized + "Leave now · Fri 22 Aug, 19:04" 11.5px mutedFg + outline "Edit" button (returns to form). New but tiny state: `searched && results` shows summary instead of the form.
- Results header row: "2 options found" 13px/600 left, "3 routes out of service" 12px mutedFg right
- **Fastest trip card** (expanded, rank 0): `borderStrong` border + slightly stronger shadow. Row 1: mono time `19:04→19:27` 24px/600 left, `~23 min` muted pill right. Row 2: route badge pill + "Direct · every 15 min" 12px mutedFg + PDF badge right (only when `verified`). Divider, then leg rows: 13px body text left ("Walk 4 min → board **Bus Terminal**", bold stop names in `foreground`), mono 13px time right. No timeline dots/rails in the compact leg list.
- Collapsed trip card: mono time 18px + badge chain `GREEN → PURPLE` + "1 transfer · ~37 min" + chevron ▾. Tap expands (existing `open` state).
- Replace the FASTEST badge with the card treatment above; if a badge is still wanted use `primary` bg pill "Fastest" 10.5px/700. EST badge → outline pill "Estimated" in `mutedFg`.
- Footnote: 11px `faint`, centered: "Estimates from posted PDFs · verify with Transportation Office (DSN 755-0424)"

### 2c No trips
Card, centered, padding 28px: 40px muted circle with simple glyph, "No trips available" 15px/600, body 13px mutedFg (existing overnight/OOS copy), then two outline suggestion buttons ("Try tomorrow 09:00" — sets tMode=depart with next service day, "Change time" — focuses the When section).

### 2d Stop search (StopInput)
- Focused input: `focusBorder` + focus ring (replace current cyan glow)
- Dropdown: card bg, 1px border, radius 10, `0 8px 24px rgba(0,0,0,0.1)`, 4–6px below input
- Item: `10px 14px`, label 13px (highlighted row bg = muted, weight 600), sub-line 11.5px mutedFg "Nearest stop: …". Building rows are plain foreground — **no gold text**
- Keep keyboard nav/ARIA exactly as implemented; swap `scrollIntoView` for a scroll-position calc on the list container

### 2e Now
- "Where are you?" card: 13px/600 label, stop input, "As of 19:04 — updates every minute" 11.5px faint
- Departures: **one card, divider-separated rows** (not separate cards): 12px route dot (no glow) + name 14px/600 + meta 11.5px mutedFg | right: mono 17px/600 time + "in 8 min" 11px mutedFg
- Estimated rows: `~19:18` time in mutedFg + "estimated" 11px faint. Out-of-service rows: whole row at 55% opacity, right text "Out of service" 12px/500
- Footnote: existing goldDisclaimer copy, 11px faint centered

### 2f Routes
- Info note (muted bg): "Route names beside a stop mark transfer points to other lines."
- One card, divider rows: dot 12px + "Blue Route" 14px/600 + meta 11.5px mutedFg ("Every 15 min · 13 stops · Mon–Fri · 0600–2200") + PDF badge when verified + ▾. Pink gets an outline "Trial" mini-badge after the name.

### 2g Route detail (expanded RouteCard)
- Header: back "← Routes" 12px mutedFg, 14px route dot + name 17px/600 + hours meta + PDF badge
- Stop timeline in a card: terminals = 11px filled route-color dot + 13.5px/600; intermediate = 9px hollow dot (2px route-color border, card-bg fill) + 13.5px body; 2px connector line in route color at 35% opacity; transfer routes as ` · Gold · Purple` 11px mutedFg after the stop name (drop the cyan coloring)
- Schedule note: muted box, 11px/600 uppercase label "PDF-SOURCED SCHEDULE" + 12px secondary note text

### 2h Off-Post
- Warning banner: `warnBg/warnBorder/warnText`, 12px, radius 10 — replaces the ⚠️-emoji dark-gold box
- One card, divider rows per service: 10px colored dot (reuse existing `OFFPOST[].color`) + name 14px/600 + right-aligned frequency hint 11px mutedFg; desc 12px secondary; "Pick-up: …" 11.5px faint. **No emoji icons.**
- Bottom: centered 12px "Schedules: home.army.mil/humphreys → Inter-Garrison Bus Service" as link

### 2i First-run dialog
- Overlay `rgba(9,9,11,0.5)`; card radius 14, padding `22px 20px`, max-width 420
- "Before you start" 17px/600, "시작하기 전에" 14px/600 secondary
- EN body 13px secondary; KO body 12.5px mutedFg above a divider — both now end with "…use MAPA (My Army Post App) — linked at the bottom of every page." / "…링크는 각 페이지 하단에 있습니다."
- **No store buttons in the dialog** (misclick risk). Single primary button "I understand — continue"
- Keep `humphreys.noticeSeen` persistence

### 2j Korean locale
No layout changes — same tokens; strings from `STRINGS.ko`; ensure Noto Sans KR renders and title stays 15px (drop the current KO-specific letter-spacing overrides).

### 2k Dark theme
Token swap only (table above). Active tab = background-color card on `#27272a` track; Edit/outline buttons use `#3f3f46` borders; PDF badge switches to outline gold-on-dark.

### 3a Appearance (phase 2, optional)
Settings screen with Mode (Light/Dark/System) segmented + live preview row. Persist as `humphreys.theme` (`"light" | "dark" | "system"`), resolve system via `matchMedia('(prefers-color-scheme: dark)')`. Style/base-color/radius/font pickers from screen 3a are future scope — build Mode only first.

## Interactions & Behavior (unchanged unless noted)
- All routing, search, favorites, recents, geolocation, swap, language toggle, minute-refresh logic stays as-is
- New: results view swaps form ⇄ summary card ("Edit" restores the form with values intact)
- New: no-trips suggestion buttons (see 2c)
- Transitions: keep the existing `.si` slide-in for results; button hover = `transform:translateY(-1px)` removed → use subtle bg shift (`#27272a` hover on dark primary is not needed; light primary hover `#27272a`→ #18181b at 90%): keep it minimal, 150ms ease
- Focus states: every interactive element gets the focus ring spec (2d)
- Hit targets ≥ 44px on all tappable rows/buttons (list rows already ≥ 52px)

## State Management
Add exactly one piece of state: `theme` (`useLocalStorage("humphreys.theme", "system")`) + a `ThemeContext` mirroring the existing `LangContext`, exposing the resolved token object `T`. Every component reads colors from `T` instead of the current `C` const. Update the `CSS` template string (`.inp`, `.btn`, `.seg`, `.tab`, `.dd`, `.chip`, `.timep`, scrollbar) to interpolate from `T` and regenerate when theme changes.

## Assets
- No images. Icons are text glyphs (→ ▾ ⇅ ★ ↗) and CSS shapes (dots) — no icon font, no emoji, no SVG illustrations
- Fonts: Geist + Geist Mono woff2 (self-hosted; see Typography). Noto Sans KR already in `public/fonts/`
- Favicon/app icons: unchanged

## Files
- `Shadcn UI Directions.dc.html` — the design reference, **not committed to this repo**; the live canvas is linked from the PR. Screens 2a–2l + 3a were the spec; Turn 1 and Nova/Maia/Lyra were explorations only

## Suggested implementation order
1. Token object + ThemeContext + fonts.css swap (app still looks old, but themed)
2. `CSS` string + header/tabs (removes gradient, emoji tabs, color strip)
3. Plan form + chips + footer (delete MapaCard; MAPA → footer line)
4. TripCard/Leg (2b) + no-trips (2c) + StopInput dropdown (2d)
5. NowTab (2e), RouteCard list/detail (2f/2g), OffPostTab (2h), FirstRunNotice (2i)
6. Dark theme pass (2k) + KO pass (2j) + contrast/hit-target QA
7. Phase 2: Appearance screen (3a)

QA gates: WCAG AA (4.5:1) for all text in both themes; no console errors; lint passes; KO strings don't overflow the segmented controls; `npm run build` clean.
