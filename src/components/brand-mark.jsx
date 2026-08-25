// Brand mark: muted-teal tile + warm-cream side-profile bus. Softer than the
// previous saffron+charcoal school-bus feel, and distinct from every ROUTES
// colour so the mark reads as identity, not a route badge.
//
// Two cuts. The large cut carries the door-split; at 16px and below the
// optical cut drops split + windshield window and fattens the two side
// windows so nothing lands under a pixel.
const TILE = "#3F6B78";
const INK = "#e8e4dc";

export function BrandMark({ size = 28, className }) {
  const optical = size <= 16;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="7.04" fill={TILE}/>
      {optical ? (
        <>
          <rect x="3.6" y="8" width="24.8" height="14.4" rx="3" fill={INK}/>
          <rect x="6" y="10.4" width="8.4" height="4.8" rx="1" fill={TILE}/>
          <rect x="15.6" y="10.4" width="8.4" height="4.8" rx="1" fill={TILE}/>
          <circle cx="9" cy="25" r="2.6" fill={INK}/>
          <circle cx="9" cy="25" r="1.5" fill={TILE}/>
          <circle cx="23" cy="25" r="2.6" fill={INK}/>
          <circle cx="23" cy="25" r="1.5" fill={TILE}/>
        </>
      ) : (
        <>
          <rect x="4" y="8" width="24" height="14" rx="3" fill={INK}/>
          <rect x="5.8" y="10.2" width="4.5" height="4.4" rx="0.8" fill={TILE}/>
          <rect x="11.2" y="10.2" width="4.5" height="4.4" rx="0.8" fill={TILE}/>
          <rect x="16.6" y="10.2" width="4.5" height="4.4" rx="0.8" fill={TILE}/>
          <rect x="22" y="10.2" width="4.2" height="4.4" rx="0.8" fill={TILE}/>
          <rect x="21.5" y="15.6" width="0.5" height="6.4" fill={TILE}/>
          <circle cx="9" cy="25" r="2.4" fill={INK}/>
          <circle cx="9" cy="25" r="1.4" fill={TILE}/>
          <circle cx="23" cy="25" r="2.4" fill={INK}/>
          <circle cx="23" cy="25" r="1.4" fill={TILE}/>
        </>
      )}
    </svg>
  );
}
