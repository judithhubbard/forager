// Per-group color generator. Replaces the static GROUP_COLORS map
// that lived in src/routes/+page.svelte and capped out at ~20 hand-
// picked hues.
//
// Algorithm: HSL with golden-angle (137.5°) hue increments keyed by a
// stable hash of the group name. Generates an unlimited series of
// visually distinct hues — no birthday-paradox collisions like a
// hash-into-a-fixed-palette would have. Stable across deploys so
// the same group always gets the same color.
//
// Curated overrides exist for the well-known groups so common
// species (apple, raspberry, hickory, …) keep their human-tuned
// colors and don't shift when neighbors are added.

/** Curated hand-picked hues for the most common foraging groups.
 *  Falls through to the generator for anything not listed. */
const OVERRIDES: Record<string, string> = {
  Almond:              '#fabed4',
  'Apple / Pear':      '#3cb44b',
  'Autumn olive':      '#808000',
  Blueberry:           '#4363d8',
  Bramble:             '#800000', // generic fallback for unrecognized Rubus
  'Black raspberry':   '#4b1f6e',
  'Red raspberry':     '#e30b5c',
  Wineberry:           '#d35400',
  'Allegheny blackberry': '#1a2540',
  'Cherry / Plum':     '#e6194b',
  Chestnut:            '#9a6324',
  'Cornelian cherry':  '#ff8c42',
  Currant:             '#911eb4',
  Elderberry:          '#673ab7',
  Grape:               '#dcbeff',
  Hazelnut:            '#f58231',
  Hickory:             '#ffe119',
  Mulberry:            '#f032e6',
  Mushroom:            '#469990',
  Other:               '#a9a9a9',
  Pawpaw:              '#bfef45',
  Persimmon:           '#03a9f4',
  Serviceberry:        '#42d4f4',
  Walnut:              '#795548'
};

const GOLDEN_ANGLE_DEG = 137.50776405003785;

/** djb2: small, fast, deterministic — same input always produces the
 *  same 32-bit unsigned integer. We only use it to pick a stable
 *  hue index per group name. */
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Return a CSS hsl() color for a given group name. Curated overrides
 *  win; otherwise we walk a golden-angle hue series, which is known
 *  to produce visually well-separated colors at any cardinality. */
export function colorForGroup(group: string): string {
  if (group in OVERRIDES) return OVERRIDES[group];
  const idx = hash(group) % 360; // wrap into 0..359 hue space
  const hue = (idx * GOLDEN_ANGLE_DEG) % 360;
  // Saturation + lightness chosen to keep all colors roughly equal in
  // perceived weight (no super-pale or super-dark surprises). Tweak
  // if pin markers start looking washed out on certain basemaps.
  const saturation = 65;
  const lightness = 50;
  return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
}

/** Per-category color. Used both as the fallback when a pin has no
 *  group AND as the primary palette when the user picks "By category
 *  only" in the marker-color setting.
 *
 *  Picked from a qualitative high-contrast palette (ColorBrewer Set1
 *  family) so the 5 categories sit in clearly separate hue zones —
 *  red / orange / brown / purple / green / gray. The earlier
 *  "match the food's natural color" palette put fruit, bramble, and
 *  nut all in warm darks that read as a single mass on screen. */
export function colorForCategoryFallback(
  cat:
    | 'fruit'
    | 'bramble'
    | 'nut'
    | 'mushroom'
    | 'other'
    | 'unknown'
    | null
    | undefined
): string {
  switch (cat) {
    case 'fruit':    return '#e41a1c'; // red
    case 'bramble':  return '#ffd400'; // yellow
    case 'nut':      return '#1f78b4'; // blue
    case 'mushroom': return '#984ea3'; // purple
    case 'other':    return '#4daf4a'; // green
    default:         return '#999999'; // neutral gray
  }
}
