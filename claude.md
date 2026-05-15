# Humphreys Transit

A mobile-first React app for planning on-post bus trips at Camp Humphreys (USAG Korea), the largest U.S. military installation overseas.

## Stack

- React 18 + Vite
- No external state management — local component state only
- No CSS framework — inline styles via a shared color palette object (`C`) plus a small `<style>{CSS}</style>` block for shared rules (form elements, animations, scrollbar)

## Audience

Soldiers, family members, civilian employees, and Korean nationals (KATUSAs, KSC battalion staff, Korean civilian employees, Korean spouses) living and working on Camp Humphreys. Mobile-first because most users are on phones standing at a stop.

## Aesthetic

Army olive + gold. Two fonts:

- **Rajdhani** (display + UI) — military feel, tall caps
- **JetBrains Mono** (times, route badges) — distinguishes clock data from prose

Dark theme by default (olive on near-black). No light mode planned.

## Data sources

8 on-post routes (Blue, Black, Green, Orange, Purple, Gold, Brown, Pink) plus 5 inter-garrison routes (Incheon Airport, Seoul/Dragon Hill, K-16, Daegu, Osan).

Verification status:

- **Gold Route**: verified from official July 2023 PDF (`:00 :20 :40` departures from Bus Terminal)
- **Brown, Pink**: stops estimated — real PDFs still needed
- **Blue, Black, Green, Orange, Purple**: stops listed, frequencies estimated (every 20–30 min)
- **Inter-garrison routes**: not integrated into trip planner; shown as info only

Building-number directory: ~15 mapped of an unknown total. Full directory pending from DPW GIS / IGI&S office (Bldg 6140).

## Conventions

- Stop names in proper case (`"Bus Terminal"`, `"Main Exchange (PX)"`)
- Times in 24h format (`HH:MM`)
- Mock walk times: 3 min per segment
- Mock ride times: 2 min per stop (heuristic, not real)
- Wait times: `freq ÷ 2` (statistical average)
- Service hours filtered automatically: routes out of service at the planned trip time are excluded from results

## Out of scope (for now)

- Real-time GPS tracking — requires bus hardware + DoD-approved backend (documented in Off-Post tab)
- Multi-day or multi-leg trip planning
- Account features / login

## Reference contacts

- USAG Humphreys Public Affairs Office: Manages MyArmyPost App (MAPA)
- Transportation Office: DSN 755-0424
- DPW GIS / IGI&S: Bldg 6140
- USAG Humphreys website: home.army.mil/humphreys

## When working on this codebase

- Prefer small, atomic commits per feature
- Keep the single-component structure until it actually hurts; do not pre-split into many files
- The `findTrips` function is the heart of routing logic — read it carefully before touching
- Wait/ride time heuristics will get replaced once real schedule PDFs arrive; do not over-engineer them now
- See `Roadmap.md` for the planned improvement queue and rationale