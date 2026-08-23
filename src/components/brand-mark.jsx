// Brand mark: saffron tile + charcoal bus. The only place #FFC83D appears —
// "Saffron Signal" keeps the gold people recognise and retires it from the
// interface, so nothing in chrome may reuse these values.
//
// Two cuts from the artboard. The 28px and 96px cuts are byte-identical, so
// one path set covers every size down to 20; at 16 and below the roof strip
// falls under a pixel, so the optical cut drops it and fattens the window and
// wheels instead. Same silhouette, still legible at favicon size.
const TILE = "#FFC83D";
const INK = "#1f2328";

export function BrandMark({ size = 28, className }) {
  const optical = size <= 16;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none"
      aria-hidden="true" focusable="false" className={className}>
      <rect width="32" height="32" rx="7.04" fill={TILE}/>
      {optical ? (
        <>
          <rect x="7.4" y="5.4" width="17.2" height="21.2" rx="4.2" fill={INK}/>
          <rect x="9.7" y="10.4" width="12.6" height="8.4" rx="2.4" fill={TILE}/>
          <circle cx="11.8" cy="23" r="2" fill={TILE}/>
          <circle cx="20.2" cy="23" r="2" fill={TILE}/>
        </>
      ) : (
        <>
          <rect x="7.5" y="5.5" width="17" height="21" rx="4.2" fill={INK}/>
          <rect x="11.6" y="8.2" width="8.8" height="2.7" rx="1.35" fill={TILE}/>
          <rect x="10" y="12.4" width="12" height="7.4" rx="2.2" fill={TILE}/>
          <circle cx="11.9" cy="23" r="1.75" fill={TILE}/>
          <circle cx="20.1" cy="23" r="1.75" fill={TILE}/>
        </>
      )}
    </svg>
  );
}
