// Canonical interest-group taxonomy. The species table tags rows with
// these strings via species.interest_tags (text[]); the welcome flow
// and settings UI render groups in the order defined here.
//
// Keep in sync with migration 20260507000029 (which both adds the
// column and tags every species). When adding a new group:
//   1. Add it here with copy + coverage hint.
//   2. Tag the relevant species rows in a follow-up migration.

export type InterestGroup =
  | 'tree_fruit'
  | 'bramble_berry'
  | 'wild_green'
  | 'mushroom_beginner'
  | 'mushroom_advanced'
  | 'nut_easy'
  | 'nut_intensive'
  | 'sap_syrup'
  | 'flower_aromatic'
  | 'root_tuber';

export interface InterestGroupSpec {
  id: InterestGroup;
  /** Title shown in checkbox label. */
  label: string;
  /** "(apples, mulberries, …)" — short example list. */
  examples: string;
  /** One-line note after the label, e.g. "tens of thousands of public pins"
   *  or "your finds only — no public coverage yet". Honest signaling. */
  coverage: string;
  /** True if checked by default for new accounts. Tree fruit + brambles
   *  cover what most casual foragers actually do. */
  defaultOn: boolean;
  /** Optional caution shown alongside the label. Kept terse. */
  caution?: string;
}

export const INTEREST_GROUPS: InterestGroupSpec[] = [
  {
    id: 'tree_fruit',
    label: 'Tree fruit',
    examples: 'apples, mulberries, cherries, pawpaw, hawthorn, citrus, fig, olive, pomegranate, mango',
    coverage: 'tens of thousands of public pins across the US',
    defaultOn: true
  },
  {
    id: 'bramble_berry',
    label: 'Berries & brambles',
    examples: 'raspberries, blackberries, blueberries, currants, rose hips',
    coverage: 'partial public coverage; mostly your own pins',
    defaultOn: true
  },
  {
    id: 'nut_easy',
    label: 'Nuts — easy',
    examples: 'chestnuts, hazelnuts, beechnuts, pine nuts',
    coverage: 'public coverage in cities',
    defaultOn: false
  },
  {
    id: 'nut_intensive',
    label: 'Nuts — intensive',
    examples: 'black walnut, hickory, acorns',
    coverage: 'public coverage in cities',
    defaultOn: false,
    caution: 'cracking, leaching, processing required'
  },
  {
    id: 'sap_syrup',
    label: 'Sap & syrup',
    examples: 'sugar maple, red maple, birches',
    coverage: 'trees mapped publicly; tapping is your activity',
    defaultOn: false
  },
  {
    id: 'flower_aromatic',
    label: 'Flowers & aromatics',
    examples: 'redbud, sumac, basswood, sassafras, spicebush, white pine',
    coverage: 'partial public coverage',
    defaultOn: false
  },
  {
    id: 'wild_green',
    label: 'Wild greens & herbs',
    examples: 'dandelion, nettle, ramps, purslane, lamb’s quarters',
    coverage: 'your finds only — no public coverage yet',
    defaultOn: false
  },
  {
    id: 'mushroom_beginner',
    label: 'Mushrooms — beginner',
    examples: 'lion’s mane, hen of the woods, oyster, wood ear',
    coverage: 'your finds only — no public coverage yet',
    defaultOn: false,
    caution: 'no toxic look-alikes'
  },
  {
    id: 'mushroom_advanced',
    label: 'Mushrooms — advanced',
    examples: 'chanterelle, morel, porcini, shaggy mane',
    coverage: 'your finds only — no public coverage yet',
    defaultOn: false,
    caution: 'careful ID required — toxic look-alikes'
  },
  {
    id: 'root_tuber',
    label: 'Roots & tubers',
    examples: 'sunchoke, burdock, groundnut',
    coverage: 'your finds only — no public coverage yet',
    defaultOn: false
  }
];

/** Default-on group ids for new account onboarding. */
export const DEFAULT_INTERESTS: InterestGroup[] = INTEREST_GROUPS
  .filter((g) => g.defaultOn)
  .map((g) => g.id);
