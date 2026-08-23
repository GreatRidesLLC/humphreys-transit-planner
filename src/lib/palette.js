// Route colours, approved 2026-08-23. Chosen for colour-vision-deficiency
// separation as well as contrast: the worst pair distance under deuteranopia
// went 3.10 → 9.76 ΔE and under protanopia 2.32 → 10.10 (the old Orange/Brown
// pair was effectively one colour for those viewers).
//
// `fill` also lands on ROUTES[*].color in routing.js — dots, timeline rails and
// badge pills all read from one of the two. `ink` is the badge text; every pair
// clears WCAG AA 4.5:1 and src/lib/palette.test.js fails the build if one stops.
// Do not hand-tune a value here without re-running that test.
export const ROUTE_BADGE = {
  BLUE:   { bg:"#4a90e2", fg:"#0c2849" }, // 4.51:1
  BLACK:  { bg:"#434c5e", fg:"#ffffff" }, // 8.63:1
  GREEN:  { bg:"#2e8b57", fg:"#06110b" }, // 4.53:1
  ORANGE: { bg:"#eb710e", fg:"#482304" }, // 4.55:1
  PURPLE: { bg:"#7c3aed", fg:"#ffffff" }, // 5.70:1
  GOLD:   { bg:"#8f6a04", fg:"#ffffff" }, // 4.96:1
  BROWN:  { bg:"#85502a", fg:"#ffffff" }, // 6.61:1
  PINK:   { bg:"#e91e8c", fg:"#270417" }, // 4.51:1
};

const channels = hex => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
};

export const relativeLuminance = hex => {
  const [r, g, b] = channels(hex).map(c =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
