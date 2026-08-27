// Brand mark: deep-plum tile + pale-lilac coach shown in a 3/4 front-corner
// view (2026-08-27 iteration). Front plane carries the windshield, headlights,
// and grille strip; a shaded side plane recedes to the right with its own
// tinted window band, roof sloping down and bottom rising toward the back so
// the perspective reads at once. Distinct in hue and saturation from the vivid
// Purple Route badge (#7c3aed) so the mark reads as identity, not a route
// pill.
//
// Two cuts. The large cut carries the full 3/4 geometry with wheels tucked
// into the fender skirt so the bus reads as one object. At 16px and below
// the optical cut collapses to a bold front-only silhouette because the
// receding side plane and its window slivers mush at that size.
const TILE = "#332740";
const BODY = "#d4c5e6";
const SHADE = "#b8a7cf";
const INK = "#241933";

export function BrandMark({ size = 28, className }) {
  const optical = size <= 16;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="7.04" fill={TILE}/>
      {optical ? (
        <>
          <rect x="4.4" y="7.6" width="19.2" height="16" rx="2.4" fill={BODY}/>
          <rect x="6.4" y="9.6" width="15.2" height="5.4" rx="1" fill={TILE}/>
          <circle cx="7.4" cy="18" r="1" fill={TILE}/>
          <circle cx="20.6" cy="18" r="1" fill={TILE}/>
          <circle cx="9.6" cy="25.6" r="2.4" fill={BODY}/>
          <circle cx="9.6" cy="25.6" r="1.2" fill={TILE}/>
          <circle cx="22.4" cy="25.6" r="2.4" fill={BODY}/>
          <circle cx="22.4" cy="25.6" r="1.2" fill={TILE}/>
        </>
      ) : (
        <>
          <path d="M17 8 L26 10.4 Q27.6 10.8 27.6 12.4 L27.6 20 Q27.6 21.6 26 22 L17 24 Z" fill={SHADE}/>
          <path d="M5 6.4 L16.4 6.4 Q17 6.4 17 7.6 L17 24 L5 24 Q3.4 24 3.4 22.4 L3.4 8 Q3.4 6.4 5 6.4 Z" fill={BODY}/>
          <path d="M5.8 8.4 L15.6 8.4 Q16 8.4 16 8.8 L16 14 L5.6 14 Z" fill={TILE}/>
          <path d="M18 10.6 L26 12.6 L26 14.6 L18 14.6 Z" fill={TILE}/>
          <path d="M3.6 16.6 L17 16.6 L26 17.6 L26 18.2 L17 17.2 L3.6 17.2 Z" fill={INK} opacity="0.55"/>
          <circle cx="6.4" cy="19.2" r="0.95" fill={TILE}/>
          <circle cx="14.6" cy="19.2" r="0.95" fill={TILE}/>
          <rect x="7.6" y="20.8" width="6" height="0.55" rx="0.2" fill={TILE} opacity="0.7"/>
          <circle cx="6.6" cy="25.4" r="2.2" fill={BODY}/>
          <circle cx="6.6" cy="25.4" r="1.1" fill={TILE}/>
          <circle cx="13.8" cy="25.4" r="2.2" fill={BODY}/>
          <circle cx="13.8" cy="25.4" r="1.1" fill={TILE}/>
          <circle cx="23.4" cy="24.4" r="2" fill={BODY}/>
          <circle cx="23.4" cy="24.4" r="1" fill={TILE}/>
        </>
      )}
    </svg>
  );
}
