// Brand mark: deep-plum tile + pale-lilac coach shown front-on
// (2026-08-31 simplification, after briefly experimenting with a 3/4
// front-corner view 2026-08-27 → 2026-08-31). One silhouette at every
// size: rounded body, dark windshield, two rimmed headlights so they
// read as lamps not wheel-dots, two wheels. Distinct in hue and
// saturation from the vivid Purple Route badge (#7c3aed) so the mark
// reads as identity, not a route pill.
const TILE = "#332740";
const BODY = "#d4c5e6";
const HIGH = "#e6dcf1";

export function BrandMark({ size = 28, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="7.04" fill={TILE}/>
      <rect x="4.4" y="7.6" width="19.2" height="16" rx="2.4" fill={BODY}/>
      <rect x="6.4" y="9.6" width="15.2" height="5.4" rx="1" fill={TILE}/>
      <circle cx="7.4" cy="18" r="1.2" fill={HIGH}/>
      <circle cx="7.4" cy="18" r="0.55" fill={TILE}/>
      <circle cx="20.6" cy="18" r="1.2" fill={HIGH}/>
      <circle cx="20.6" cy="18" r="0.55" fill={TILE}/>
      <circle cx="8.4" cy="24.8" r="2.2" fill={BODY}/>
      <circle cx="8.4" cy="24.8" r="1.05" fill={TILE}/>
      <circle cx="19.6" cy="24.8" r="2.2" fill={BODY}/>
      <circle cx="19.6" cy="24.8" r="1.05" fill={TILE}/>
    </svg>
  );
}
