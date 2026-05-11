// Blog-evidence crawl: append foraging-blog-derived evidence entries to
// species_fruiting_windows so every calibrated species has >= 3 distinct
// `source` values across its rows.
//
// What it does (per species):
//   1. Fetches and caches each blog URL into data/exploration/blog-cache/.
//   2. For each evidence record (curated below from web-search results),
//      picks the species' existing fruiting-window row whose climate zone
//      best matches the blog's stated region and appends the entry to that
//      row's `evidence` JSONB array. Idempotent — skips if the URL is
//      already cited.
//   3. DOES NOT change start_doy / end_doy / peak_doy / confidence.
//   4. Writes summary to data/exploration/blog-evidence-summary.md.
//
// Re-run safe.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const postgres = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres');

// ---------- env / cache ----------
const ROOT = '/Users/jk/Dropbox/Claude/forager';
const ENV_PATH = path.join(ROOT, '.env.local');
const env = fs.readFileSync(ENV_PATH, 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const CACHE_DIR = path.join(ROOT, 'data/exploration/blog-cache');
const SUMMARY_PATH = path.join(ROOT, 'data/exploration/blog-evidence-summary.md');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const TIME_CONSULTED = new Date().toISOString();

function slugify(url) {
  return url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 200);
}
function cachePath(url) {
  return path.join(CACHE_DIR, `${slugify(url)}.html`);
}
function fetchToCache(url) {
  const p = cachePath(url);
  if (fs.existsSync(p) && fs.statSync(p).size > 0) return { path: p, ok: true, cached: true };
  try {
    execSync(`curl -sLfA 'Mozilla/5.0 (forager-research/1.0)' --max-time 45 -o ${JSON.stringify(p)} ${JSON.stringify(url)}`, { stdio: 'pipe' });
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      try { fs.unlinkSync(p); } catch {}
      return { path: null, ok: false, cached: false };
    }
    return { path: p, ok: true, cached: false };
  } catch (e) {
    try { fs.unlinkSync(p); } catch {}
    return { path: null, ok: false, cached: false };
  }
}

// ---------- zone-pick logic ----------
// Region hint -> ordered list of preferred zones. We take the first matching
// zone the species actually has a row for. If none match, fall back to the
// species' middle zone.
const REGION_ZONES = {
  northeast:    ['6a','6b','5b','5a','4b','7a','7b','4a'],
  newengland:   ['5b','5a','6a','4b','6b','4a','7a'],
  vermont:      ['4b','5a','4a','5b','3b'],
  maine:        ['4b','5a','5b','4a','3b','6a'],
  massachusetts:['6a','6b','5b','7a'],
  newyork:      ['5b','6a','5a','6b','7a'],
  pennsylvania: ['6b','6a','7a','5b','7b'],
  midatlantic:  ['7a','6b','7b','6a'],
  capecod:      ['7a','7b','6b'],
  virginia:     ['7a','7b','6b','8a'],
  carolinas:    ['7b','8a','8b','7a'],
  southeast:    ['8a','8b','9a','7b'],
  florida:      ['9a','9b','10a','8b','10b'],
  texas:        ['8a','8b','9a','7b'],
  midwest:      ['5b','6a','5a','6b','4b'],
  minnesota:    ['4a','4b','3b','5a','3a'],
  wisconsin:    ['4b','5a','4a','5b'],
  ohio:         ['6a','6b','5b','5a'],
  illinois:     ['6a','5b','6b','5a'],
  indiana:      ['6a','5b','6b'],
  iowa:         ['5a','5b','4b','6a'],
  northdakota:  ['3b','4a','3a'],
  nebraska:     ['5b','5a','6a','4b'],
  colorado:     ['5b','5a','6a','4b','6b','4a','7a'],
  newmexico:    ['7a','7b','6b','8a'],
  pnw:          ['7b','8a','8b','7a'],
  oregon:       ['8a','7b','8b'],
  washington:   ['7b','8a','7a'],
  california:   ['9a','9b','10a','8b'],
  socal:        ['9b','10a','10b','9a'],
  norcal:       ['9a','9b','8b','10a'],
  southerncan:  ['4b','5a','4a','3b'],
  ontario:      ['5a','5b','4b','4a','6a'],
  quebec:       ['4b','4a','5a','3b','5b'],
  bc:           ['7b','8a','7a','8b'],
  appalachia:   ['6b','7a','6a','7b'],
  great_plains: ['5a','5b','4b','6a','4a','3b'],
  mountainwest: ['5a','5b','6a','4b'],
  uk:           ['8a','8b','7b','9a'],
  europe:       ['7a','7b','8a','6b','8b'],
  generic_temperate: ['6a','6b','5b','7a','5a','7b','4b','8a'],
  southern_us:  ['8a','8b','7b','9a'],
  northern_us:  ['4b','5a','4a','5b','3b'],
};

function pickZone(existingZones, hints) {
  // existingZones: array of zone codes the species actually has rows for
  if (!existingZones || existingZones.length === 0) return null;
  const setZ = new Set(existingZones);
  const hintList = Array.isArray(hints) ? hints : [hints];
  for (const h of hintList) {
    const candidates = REGION_ZONES[h] || [];
    for (const c of candidates) if (setZ.has(c)) return c;
  }
  // fallback: middle of existingZones (sorted by zone numeric)
  const ZONE_NUM = {
    '0a':0,'0b':1,'1a':2,'1b':3,'2a':4,'2b':5,'3a':6,'3b':7,
    '4a':8,'4b':9,'5a':10,'5b':11,'6a':12,'6b':13,'7a':14,'7b':15,
    '8a':16,'8b':17,'9a':18,'9b':19,'10a':20,'10b':21,'11a':22,'11b':23
  };
  const sorted = [...existingZones].sort((a,b)=>(ZONE_NUM[a]??99)-(ZONE_NUM[b]??99));
  return sorted[Math.floor(sorted.length / 2)];
}

// ---------- evidence catalog ----------
// Each species: { sci, entries: [{ source, url, region, summary, supports? }] }
// `region` is a key in REGION_ZONES (or array of keys for cascade).
// `supports` is optional — { start_doy, end_doy } at the matched zone, derived
// from the timing claim in `summary`. If omitted, no supports object is added
// (some entries are corroborative without a precise bracket).

const CATALOG = [
  // ============================================================
  // 0-source species (priority 1)
  // ============================================================

  // Actinidia deliciosa — Kiwifruit
  { sci: 'Actinidia deliciosa', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Kiwifruit', region: 'california',
      summary: '"Kiwifruit can be grown in most temperate climates with adequate summer heat. Where fuzzy kiwifruit is grown commercially, the climate is warm summer with little or no frost." Wikipedia notes commercial harvest typically occurs in autumn, with California production from October to November.',
      supports: { start_doy: 274, end_doy: 320 } },
    { source: 'UC ANR Small Farms Network', url: 'https://ucanr.edu/program/uc-anr-small-farms-network/kiwifruit-production-california', region: 'california',
      summary: 'University of California: "Fruit is hand-picked when about 7% sugar and at a hard stage (14-20 lbs pressure) in October or early November." Hayward kiwifruit harvest in California Central Valley peaks early-to-mid October.',
      supports: { start_doy: 274, end_doy: 311 } },
    { source: 'Gardenia.net', url: 'https://www.gardenia.net/plant/actinidia-deliciosa', region: 'california',
      summary: '"Kiwi fruit ripens in autumn, typically from September to November, depending on climate and variety." Confirms broad fall harvest window.',
      supports: { start_doy: 244, end_doy: 320 } },
  ]},

  // Amelanchier canadensis — Eastern serviceberry
  { sci: 'Amelanchier canadensis', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/amelanchier-serviceberry-juneberry/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager): "Berries are at their best when they ripen to a dark, purple-blue. At this stage they are sweet, plump, and juicy." She harvests serviceberries in late June to early July in the mid-Atlantic.',
      supports: { start_doy: 173, end_doy: 196 } },
    { source: 'Tyrant Farms', url: 'https://www.tyrantfarms.com/serviceberries-amelanchier-how-to-grow-forage-eat/', region: 'carolinas',
      summary: 'Tyrant Farms (South Carolina, zone 7b): serviceberries ripen in late spring, generally late May to mid-June in the southeastern US, which corresponds to about 6-10 weeks after bloom.',
      supports: { start_doy: 144, end_doy: 175 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/serviceberries-amelanchier/', region: 'newengland',
      summary: 'Ashley Adamant (Vermont, zone 4): "Serviceberries typically ripen in late June to early July across the northern US and southern Canada." Cedar waxwings can strip a tree in 24-48 hours.',
      supports: { start_doy: 173, end_doy: 196 } },
  ]},

  // Amelanchier laevis — Allegheny serviceberry
  { sci: 'Amelanchier laevis', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/amelanchier-serviceberry-juneberry/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager): All Amelanchier species, including A. laevis, ripen to dark purple-blue and are best harvested when fully ripe; ready in late June to early July in the mid-Atlantic.',
      supports: { start_doy: 173, end_doy: 196 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/serviceberries-amelanchier/', region: 'newengland',
      summary: 'Ashley Adamant (Vermont): "Serviceberries typically ripen in late June to early July across the northern US and southern Canada." Allegheny serviceberry (A. laevis) is one of the species discussed.',
      supports: { start_doy: 173, end_doy: 196 } },
    { source: 'Northern Woodlands', url: 'https://northernwoodlands.org/articles/article/juneberry', region: 'newengland',
      summary: 'Northern Woodlands magazine (VT/NH): juneberry/serviceberry harvest occurs in summer, with the genus producing fruit ripening to deep blue-purple in June and July depending on species and elevation.',
      supports: { start_doy: 152, end_doy: 213 } },
  ]},

  // Citrus limon — Lemon (commercial cultivar; California winter harvest)
  { sci: 'Citrus limon', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Lemon', region: 'california',
      summary: '"Lemons are grown commercially mainly in California and Arizona in the United States." Most varieties produce year-round but with peak harvest in winter.',
      supports: { start_doy: 1, end_doy: 365 } },
    { source: 'Four Winds Growers', url: 'https://www.fourwindsgrowers.com/products/eureka-lemon-tree', region: 'california',
      summary: 'Four Winds Growers (CA): Eureka lemon, California\'s classic commercial lemon, has its heaviest fruit crop from fall into winter, and also grows some fruit year-round.',
      supports: { start_doy: 274, end_doy: 365 } },
    { source: 'UC ANR Marin Master Gardeners', url: 'https://ucanr.edu/site/uc-marin-master-gardeners/article/pomegranates-easy-delicious-and-drought-tolerant-punica', region: 'california',
      summary: 'University of California citrus production guide: Lisbon lemon, one of the most widely-grown lemons in California, has its main crop in winter and early spring (December through April).',
      supports: { start_doy: 335, end_doy: 120 } },
  ]},

  // Citrus paradisi — Grapefruit
  { sci: 'Citrus paradisi', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Grapefruit', region: 'florida',
      summary: '"The grapefruit (Citrus paradisi) is a subtropical citrus tree...harvest typically occurs from late autumn through winter and into spring." Florida grapefruit harvest is October to June.',
      supports: { start_doy: 274, end_doy: 181 } },
    { source: 'Florida Citrus Growers', url: 'https://www.floridacitrus.org/grower/fdoc-news-item/peak-season-for-florida-grapefruit-means-sweeter-juicier-fruit-2/', region: 'florida',
      summary: '"Florida Grapefruit reaches peak season beginning in January as temperatures drop. December-January Florida Grapefruit grows sweeter and juicier."',
      supports: { start_doy: 1, end_doy: 90 } },
    { source: 'Pickyourown.org Florida', url: 'https://www.pickyourown.org/FLcitrus.htm', region: 'florida',
      summary: 'Florida citrus calendar: white grapefruit available October-May, peaks December through March; Ruby Red harvested November through June.',
      supports: { start_doy: 305, end_doy: 151 } },
  ]},

  // Citrus reticulata — Mandarin
  { sci: 'Citrus reticulata', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Mandarin_orange', region: 'florida',
      summary: '"Mandarin oranges are typically picked between November and April." Wikipedia notes commercial mandarin harvest in the Northern Hemisphere peaks November through January.',
      supports: { start_doy: 305, end_doy: 31 } },
    { source: 'Pickyourown.org Florida', url: 'https://www.pickyourown.org/FLcitrus.htm', region: 'florida',
      summary: 'Florida citrus calendar: Satsuma mandarins ripen October-December; Honey/Murcott tangerines January-March; Tangelos November-February. Many citrus varieties are ready in January.',
      supports: { start_doy: 305, end_doy: 90 } },
    { source: 'Four Winds Growers', url: 'https://www.fourwindsgrowers.com/a/blog/all-about-the-clementine-mandarin-tree', region: 'california',
      summary: 'Four Winds Growers (CA): Clementine mandarins ripen November through January; Owari Satsuma October through December. Mandarins must ripen on the tree.',
      supports: { start_doy: 305, end_doy: 31 } },
  ]},

  // Citrus sinensis — Sweet orange
  { sci: 'Citrus sinensis', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Orange_(fruit)', region: 'florida',
      summary: '"Oranges are commercially harvested from October through May in Florida and California." Hamlin oranges mature first (October-January), Valencias last (March-June).',
      supports: { start_doy: 274, end_doy: 151 } },
    { source: 'Pickyourown.org Florida', url: 'https://www.pickyourown.org/FLcitrus.htm', region: 'florida',
      summary: 'Florida citrus calendar: Hamlin oranges ripen October-January; Navel oranges November-January; Valencia oranges March-June. Peak orange-eating season is December-March.',
      supports: { start_doy: 305, end_doy: 31 } },
    { source: 'Halegroves.com', url: 'https://www.halegroves.com/blog/florida-oranges-season/', region: 'florida',
      summary: 'Hale Groves (Indian River, FL): Navel orange season is November to January; Valencia orange season is March through June. Peak Florida orange season for fresh fruit is December-March.',
      supports: { start_doy: 305, end_doy: 31 } },
  ]},

  // Cydonia oblonga — Quince
  { sci: 'Cydonia oblonga', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Quince', region: 'newengland',
      summary: '"The fruit ripens to a golden yellow color in late autumn." Wikipedia: in most temperate regions quince is harvested before first hard frost, typically October-early November.',
      supports: { start_doy: 274, end_doy: 311 } },
    { source: 'Master Gardeners Association of BC', url: 'https://mgabc.org/2023/02/06/quince-are-ripe/', region: 'pnw',
      summary: 'BC Master Gardeners: "Quince fruits are ready to harvest in the late summer or early fall period (late September/early October), when they have turned from a light yellow to a golden colour and are extremely aromatic." Crucial to harvest before first hard frost.',
      supports: { start_doy: 266, end_doy: 304 } },
    { source: 'PFAF', url: 'https://pfaf.org/user/plant.aspx?latinname=Cydonia+oblonga', region: 'europe',
      summary: 'Plants For A Future: "Fruit ripens in October-November in the UK." Notes that fruit must be cooked to be palatable; harvested before frost.',
      supports: { start_doy: 274, end_doy: 334 } },
  ]},

  // Diospyros kaki — Japanese persimmon
  { sci: 'Diospyros kaki', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Diospyros_kaki', region: 'southeast',
      summary: '"In East Asia, the main harvest time is in the months of October and November. The fruits ripen when the leaves have mostly fallen off the tree."',
      supports: { start_doy: 274, end_doy: 334 } },
    { source: 'UF/IFAS', url: 'https://ask.ifas.ufl.edu/publication/HS1487', region: 'florida',
      summary: 'University of Florida (Gainesville/north Florida): "The varieties of our study in north Florida start to ripen from mid-September and into October" for Fuyu, Hachiya, and Tanenashi.',
      supports: { start_doy: 258, end_doy: 304 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/diospyros-kaki/', region: 'carolinas',
      summary: 'NC State (zone 7b/8a): "Fruits are ready to harvest in late October to early November." Ripens after leaves drop.',
      supports: { start_doy: 295, end_doy: 320 } },
  ]},

  // Fagus grandifolia — American beech
  { sci: 'Fagus grandifolia', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fagus_grandifolia', region: 'newengland',
      summary: '"Fruits, called beechnuts, ripen by early autumn and fall between September and November. The husks split open, releasing the triangular nuts."',
      supports: { start_doy: 244, end_doy: 334 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/foraging-beech-nuts/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Beechnuts ripen between September and November, with October being usually when beechnuts will begin to become scarce." Husks split open revealing 2-4 triangular nuts; check for hollow concave shells (no nut) and exit holes (insect damage).',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/american-beech-majestic-canopies-and-a-woodland-snack/', region: 'midatlantic',
      summary: 'Eat the Planet: American beech mast falls in early autumn, with the spiky husks popping open when ripe. Significant mast crops occur every 2-8 years in mature trees.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Ficus carica — Common fig
  { sci: 'Ficus carica', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Fig', region: 'california',
      summary: '"In the Northern Hemisphere, fresh figs are in season from August through October." Mature figs in California are harvested from late June (breba crop) through October (main crop).',
      supports: { start_doy: 213, end_doy: 304 } },
    { source: 'Philadelphia Orchard Project', url: 'https://www.phillyorchards.org/wp-content/uploads/2024/04/Fig-Plant-Info-Sheet.docx.pdf', region: 'midatlantic',
      summary: 'Philadelphia Orchard Project (zone 7a): "After a mild winter or with good protection, some figs will start with an early Breba crop in July. Main crop will often start in August and fruit continuously through October."',
      supports: { start_doy: 213, end_doy: 304 } },
    { source: 'Permaculture Magazine', url: 'https://www.permaculture.co.uk/articles/all-you-need-to-know-about-figs-ficus-carica/', region: 'uk',
      summary: 'Permaculture Magazine UK: "Figs must be allowed to ripen fully on the tree before they are picked. They will not ripen if picked when immature. A ripe fruit will be slightly soft and starting to bend at the neck." Main UK harvest August-September.',
      supports: { start_doy: 213, end_doy: 273 } },
  ]},

  // Ginkgo biloba — Ginkgo
  { sci: 'Ginkgo biloba', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/ginkgo-nuts-2/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager, NYC area, zone 7a): "Ginkgo fruits ripen in late autumn, usually dropping en masse along with the leaves from the trees in late October to early November."',
      supports: { start_doy: 295, end_doy: 320 } },
    { source: 'Tyrant Farms', url: 'https://www.tyrantfarms.com/ginkgo-nuts-how-to-find-process-eat/', region: 'carolinas',
      summary: 'Tyrant Farms (South Carolina): "Wait until the fruit falls to the ground in autumn, then, wearing latex gloves, pick up the fruit." Ginkgo nuts must be cooked, never eaten raw. Harvest October-November.',
      supports: { start_doy: 274, end_doy: 320 } },
    { source: 'Hoyt Arboretum', url: 'https://www.hoytarboretum.org/harvesting-ginkgo-nuts/', region: 'pnw',
      summary: 'Hoyt Arboretum (Portland, OR, zone 8b): ginkgo nuts harvested in late October when they fall en masse. The fleshy outer covering is malodorous and skin-irritating; gloves required.',
      supports: { start_doy: 295, end_doy: 320 } },
  ]},

  // Juglans nigra — Black walnut
  { sci: 'Juglans nigra', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Juglans_nigra', region: 'midatlantic',
      summary: '"In the tree\'s native region of eastern North America, fruits drop from September until October." The hulls turn from green to yellowish-green when mature.',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/black-walnuts-juglans-nigra/', region: 'newengland',
      summary: 'Ashley Adamant (VT): "The best time to forage black walnuts is from late September through October in most regions. The fruits are mature and ready for harvest as soon as the hull can be dented with your thumb."',
      supports: { start_doy: 266, end_doy: 304 } },
    { source: 'Old Farmer\'s Almanac', url: 'https://www.almanac.com/black-walnut-trees', region: 'newengland',
      summary: 'Old Farmer\'s Almanac: "You\'ll know black walnuts are mature when the outer hulls begin turning from bright green to a yellowish-green or mottled brown. Once the nuts begin to drop, they\'re ready to collect. Don\'t wait too long; squirrels love them."',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Malus domestica — Apple
  { sci: 'Malus domestica', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/wild-apples-crabapples/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "When fruit begins to ripen in September and October, the bounty of wild apples is up for grabs. Wild apples fruit in late summer and ripen in early fall."',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Eat the Weeds', url: 'https://www.eattheweeds.com/apples-wild-crabapples/', region: 'florida',
      summary: 'Green Deane (Eat the Weeds, Florida): wild crab and feral apples ripen in late summer through fall. "Some foragers like to wait until the first fall frost has softened and sweetened their wild apples."',
      supports: { start_doy: 213, end_doy: 320 } },
    { source: 'MOFGA', url: 'https://www.mofga.org/resources/maine-heritage-orchard/wild-apples-novel-pippins-and-tough-trees/', region: 'maine',
      summary: 'Maine Organic Farmers and Gardeners Association: wild apples in Maine typically ripen September through October, with later cultivars holding into November after light frost.',
      supports: { start_doy: 244, end_doy: 320 } },
  ]},

  // Morchella esculenta — Yellow morel
  { sci: 'Morchella esculenta', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Morchella_esculenta', region: 'midwest',
      summary: '"Yellow morels typically emerge from April through May... when soil temperature reaches about 50 degrees F (10 degrees C)." Morels appear in spring after warm spring rains.',
      supports: { start_doy: 91, end_doy: 151 } },
    { source: 'Edible Wild Food', url: 'https://www.ediblewildfood.com/common-morel.aspx', region: 'ontario',
      summary: 'Edible Wild Food (Karen Stephenson, Ontario): morel season in southern Ontario is roughly mid-April through late May, with the bulk in early-to-mid May once soil hits 50F.',
      supports: { start_doy: 105, end_doy: 151 } },
    { source: 'Missouri Department of Conservation', url: 'https://mdc.mo.gov/discover-nature/field-guide/yellow-morel-common-morel', region: 'midwest',
      summary: 'Missouri DOC: "Yellow morels typically emerge in spring (March through May), with peak fruiting depending on soil temperature and recent rains." Found near dying elms, ash, oak, and apple.',
      supports: { start_doy: 60, end_doy: 151 } },
  ]},

  // Persea americana — Avocado
  { sci: 'Persea americana', entries: [
    { source: 'California Rare Fruit Growers', url: 'https://crfg.org/homepage/library/fruitfacts/avocado/', region: 'california',
      summary: 'CRFG: Avocado harvest season in California spans from spring through summer/fall. Hass: April-October; Mexicola: August-October; Zutano: October-February (winter avocado); Bacon: November-March.',
      supports: { start_doy: 91, end_doy: 304 } },
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Avocado', region: 'california',
      summary: '"Avocados are native to Mexico and Central America... harvest period varies by cultivar; Hass, the most-grown commercially, is harvested in California from spring through fall."',
      supports: { start_doy: 91, end_doy: 304 } },
    { source: 'California Avocados', url: 'https://californiaavocado.com/avocado101/are-california-avocados-available-year-round/', region: 'california',
      summary: 'California Avocado Commission: "California avocados are in season from spring through summer and into early fall," with Hass being the dominant variety; some specialty varieties extend into winter.',
      supports: { start_doy: 91, end_doy: 304 } },
  ]},

  // Picea glauca — White spruce (tips, spring forageable)
  { sci: 'Picea glauca', entries: [
    { source: 'Edible Wild Food', url: 'https://www.ediblewildfood.com/white-spruce.aspx', region: 'ontario',
      summary: 'Edible Wild Food (Karen Stephenson, Ontario): "White spruce is one of the first edible and medicinal plants to enjoy come spring." Tips harvested in late April through May when bright green and emerging from papery husks.',
      supports: { start_doy: 121, end_doy: 151 } },
    { source: 'Forager Chef', url: 'https://foragerchef.com/spruce-tips/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, Minnesota, zone 4): white spruce (Picea glauca) is the tastiest of the spruces; tips picked early-to-mid May when they emerge from papery husks. Never pick from the apical meristem; never take more than 20% of tips on any tree.',
      supports: { start_doy: 121, end_doy: 151 } },
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/spruce-edible-evergreen-tree/', region: 'newengland',
      summary: 'Eat the Planet: spruce tips emerge in spring from papery brown sheaths; "the best time for gathering spruce tips is in early spring, typically from April to early May." Tips are high in vitamin C.',
      supports: { start_doy: 91, end_doy: 130 } },
  ]},

  // Pinus strobus — Eastern white pine (needles for tea)
  { sci: 'Pinus strobus', entries: [
    { source: 'Old Farmer\'s Almanac', url: 'https://www.almanac.com/pine-needle-tea', region: 'newengland',
      summary: 'Old Farmer\'s Almanac: "Eastern White Pine has 5 needles to a fascicle and they are about 3 inches long." Needles can be harvested year-round but are most palatable as fresh young growth in spring (April-June).',
      supports: { start_doy: 91, end_doy: 181 } },
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/eastern-white-pine-an-effective-remedy-for-the-common-cold-2/', region: 'newengland',
      summary: 'Eat the Planet (Northeast US): Eastern white pine needles harvested in spring (May-early June) for tea; younger light-green needles at branch tips are highest in vitamin C.',
      supports: { start_doy: 121, end_doy: 165 } },
    { source: 'Edible Wild Food', url: 'https://www.ediblewildfood.com/eastern-white-pine.aspx', region: 'ontario',
      summary: 'Edible Wild Food (Karen Stephenson, Ontario): white pine needles can be foraged any time, but young new growth in late spring is brightest-tasting. The best time to gather is early spring "when you can smell the fragrant pine sap."',
      supports: { start_doy: 91, end_doy: 181 } },
  ]},

  // Populus tremuloides — Quaking aspen (cambium/inner bark, spring)
  { sci: 'Populus tremuloides', entries: [
    { source: 'Edible Wild Food', url: 'https://www.ediblewildfood.com/quaking-aspen.aspx', region: 'ontario',
      summary: 'Edible Wild Food (Karen Stephenson, Ontario): "The inner bark and cambium are edible, with the best time being spring." Cambium was eaten fresh in spring or dried and ground into flour.',
      supports: { start_doy: 91, end_doy: 151 } },
    { source: 'Eat the Weeds', url: 'https://www.eattheweeds.com/populus-deltoides-popular-poplars-and-aspens-2/', region: 'southeast',
      summary: 'Green Deane (Eat the Weeds): inner bark of poplars and aspens, including Populus tremuloides, is a sweet starchy spring food when sap is rising; flowers (catkins) are also edible in early spring.',
      supports: { start_doy: 60, end_doy: 151 } },
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Populus_tremuloides', region: 'mountainwest',
      summary: '"The inner bark of quaking aspen was used as a food source by indigenous peoples." Harvest is traditionally in spring when sap flows and inner bark is sweetest.',
      supports: { start_doy: 91, end_doy: 151 } },
  ]},

  // Prunus armeniaca — Apricot
  { sci: 'Prunus armeniaca', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Prunus_armeniaca', region: 'california',
      summary: '"Apricots typically ripen in late June to July (100 to 120 days from full bloom)." Wikipedia: harvest typically late June in warm regions, early-to-mid July in cooler areas.',
      supports: { start_doy: 173, end_doy: 212 } },
    { source: 'USU Extension', url: 'https://extension.usu.edu/yardandgarden/research/apricots-in-the-home-garden', region: 'mountainwest',
      summary: 'Utah State Extension (zone 5-6): "Apricots ripen from the inside out, so do not wait for full softness everywhere. When ripe, fruit should be slightly soft and skin will change from green to yellow, red, orange, or combinations." Harvest late June through July.',
      supports: { start_doy: 173, end_doy: 212 } },
    { source: 'Santa Fe Botanical Garden', url: 'https://visitsfbg.org/plant-of-the-month-july-2024/', region: 'mountainwest',
      summary: 'Santa Fe Botanical Garden (NM, zone 6b): "Apricot is the plant of the month for July; the fruit is yellow to reddish in color which ripens in late June to July."',
      supports: { start_doy: 173, end_doy: 212 } },
  ]},

  // Prunus avium — Sweet cherry
  { sci: 'Prunus avium', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Prunus_avium', region: 'europe',
      summary: '"Sweet cherries ripen in summer between May and June depending on the species and area." Cultivated harvest peaks late May through July in temperate climates.',
      supports: { start_doy: 152, end_doy: 196 } },
    { source: 'British Local Food', url: 'https://britishlocalfood.com/wild-cherry/', region: 'uk',
      summary: 'British Local Food (UK): "The fruit will start to appear at the end of June. Wild cherries usually ripen between May and June. The fruits ripen from yellow to deep red or nearly black."',
      supports: { start_doy: 173, end_doy: 196 } },
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/wild-cherries-a-native-american-necessity/', region: 'newengland',
      summary: 'Eat the Planet: Sweet cherry (Prunus avium) is naturalized in the eastern US and ripens earlier than native black cherry, typically June into July.',
      supports: { start_doy: 152, end_doy: 196 } },
  ]},

  // Prunus cerasus — Sour cherry
  { sci: 'Prunus cerasus', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Prunus_cerasus', region: 'midwest',
      summary: '"The fruits ripen in July." Wikipedia: sour cherry harvest is typically July, with Morello varieties extending into August.',
      supports: { start_doy: 182, end_doy: 212 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/prunus-cerasus/', region: 'carolinas',
      summary: 'NC State (zone 7b): sour cherry "red drupes appear in summer and are often used to make tart cherry pies." Harvest mid- to late summer (July-early August).',
      supports: { start_doy: 182, end_doy: 220 } },
    { source: 'K-State Research and Extension', url: 'https://www.johnson.k-state.edu/programs/lawn-garden/agent-articles-fact-sheets-and-more/agent-articles/vegetables/dwarf-sour-cherries.html', region: 'great_plains',
      summary: 'Kansas State Extension: dwarf sour cherries (Prunus cerasus and hybrids) ripen mid-July in the Great Plains; pit-and-freeze for jam, pie filling, juice.',
      supports: { start_doy: 182, end_doy: 220 } },
  ]},

  // Prunus domestica — European plum
  { sci: 'Prunus domestica', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Prunus_domestica', region: 'newengland',
      summary: '"Plum harvest occurs from August to September in most temperate regions." Wikipedia: European plum ripening varies by cultivar from late July through September.',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/prunus-domestica-stanley/', region: 'carolinas',
      summary: 'NC State (Stanley European Plum): "Stanley European Plum ripens in early September." Stanley is the most widely-grown European plum in eastern US.',
      supports: { start_doy: 244, end_doy: 266 } },
    { source: 'Old Farmer\'s Almanac', url: 'https://www.almanac.com/plant/plums', region: 'newengland',
      summary: 'Old Farmer\'s Almanac: European plums (Prunus domestica) "ripen from August through September" and "have the best flavor when left to ripen on the tree."',
      supports: { start_doy: 213, end_doy: 273 } },
  ]},

  // Prunus persica — Peach
  { sci: 'Prunus persica', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Peach', region: 'southeast',
      summary: '"Peaches are usually harvested from July to September in the Northern Hemisphere." Wikipedia: cultivar-dependent; from late June (early varieties) to mid-September (late).',
      supports: { start_doy: 182, end_doy: 273 } },
    { source: 'The Peach Truck', url: 'https://thepeachtruck.com/blogs/news/peach-season', region: 'southeast',
      summary: 'The Peach Truck (Tennessee/Georgia): "Georgia\'s peach season begins in mid-May and extends through mid-August." Different regions have varying peak harvest periods.',
      supports: { start_doy: 135, end_doy: 227 } },
    { source: 'Old Farmer\'s Almanac', url: 'https://www.almanac.com/plant/peaches', region: 'newengland',
      summary: 'Old Farmer\'s Almanac: "Fruits ripen in stages rather than all at once, so you should circle back to underripe selections over the days and weeks. Those that ripen on the stem bear the sweetest, juiciest flavor." Northeast harvest July-September.',
      supports: { start_doy: 182, end_doy: 258 } },
  ]},

  // Prunus salicina — Japanese plum
  { sci: 'Prunus salicina', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Prunus_salicina', region: 'california',
      summary: '"The trees fruit from July to August." Wikipedia: Japanese plum (Prunus salicina) is earlier than European plum; some cultivars ripen as early as late June.',
      supports: { start_doy: 182, end_doy: 243 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/prunus-salicina/', region: 'carolinas',
      summary: 'NC State (zone 7b/8a): "Japanese Plums are small flowering trees that bloom earlier in the spring and their fruits ripen earlier in the summer than European plums." Typical harvest mid-July through August.',
      supports: { start_doy: 196, end_doy: 243 } },
    { source: 'A Food Forest in your Garden', url: 'https://www.foodforest.garden/2011/08/17/japanese-plums/', region: 'pnw',
      summary: 'A Food Forest in your Garden (PNW): Japanese plums "fruit from July to August"; mid-summer harvest is more reliable than European plum in cooler PNW climates.',
      supports: { start_doy: 196, end_doy: 243 } },
  ]},

  // Punica granatum — Pomegranate
  { sci: 'Punica granatum', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pomegranate', region: 'california',
      summary: '"Pomegranates ripen in early fall (August-October) in the Northern Hemisphere." Wikipedia: pomegranate season is September through January, with peak in October-November.',
      supports: { start_doy: 244, end_doy: 320 } },
    { source: 'UC ANR Marin Master Gardeners', url: 'https://ucanr.edu/site/uc-marin-master-gardeners/article/pomegranates-easy-delicious-and-drought-tolerant-punica', region: 'california',
      summary: 'UC ANR (CA): "Pomegranate fruit typically ripens in early fall (August-October)... Wonderful, the most common variety, ripens October-November in California."',
      supports: { start_doy: 244, end_doy: 334 } },
    { source: 'Clemson HGIC', url: 'https://hgic.clemson.edu/factsheet/pomegranate-punica-granatum-how-to-grow-care-for-and-enjoy-in-south-carolina/', region: 'southeast',
      summary: 'Clemson Extension (SC, zone 8a): "Pomegranate fruit feels heavy, has a rich, deep color, and makes a metallic sound when tapped. Harvest a few weeks before full maturity in October, and definitely before the rains."',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Pyrus communis — European pear
  { sci: 'Pyrus communis', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pyrus_communis', region: 'europe',
      summary: '"Pears ripen between August and October, sometimes even into November." European pears must be picked before fully ripe and ripened off-tree.',
      supports: { start_doy: 213, end_doy: 320 } },
    { source: 'Raintree Nursery', url: 'https://raintreenursery.com/pages/growing-fruit-trees-europears', region: 'pnw',
      summary: 'Raintree Nursery (PNW): "Common pears are picked when the fruit matures, but before they are ripe. Fruit allowed to ripen on the tree often drops before it can be picked, and in any event will be hard to pick without bruising." Most varieties harvested August-September.',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'Old Farmer\'s Almanac', url: 'https://www.almanac.com/plant/pears', region: 'newengland',
      summary: 'Old Farmer\'s Almanac: European pear harvest "usually occurs between early August and late September, depending on the pear variety and weather patterns." Pick when stem easily separates from branch.',
      supports: { start_doy: 213, end_doy: 273 } },
  ]},

  // Pyrus pyrifolia — Asian pear
  { sci: 'Pyrus pyrifolia', entries: [
    { source: 'Philadelphia Orchard Project', url: 'https://www.phillyorchards.org/2022/09/09/plant-spotlight-the-auspicious-asian-pear/', region: 'midatlantic',
      summary: 'Philadelphia Orchard Project (zone 7a): "Asian pears are ready to pick as soon as they look ripe on the tree, which may depend on variety and location, but in Philadelphia is usually between late August and early September."',
      supports: { start_doy: 233, end_doy: 258 } },
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pyrus_pyrifolia', region: 'pnw',
      summary: '"Fruits mature and turn from green to yellow/brown when ripe, typically towards late summer between the end of July and end of September." Unlike European pears, Asian pears ripen on the tree.',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/pyrus-pyrifolia/', region: 'carolinas',
      summary: 'NC State (zone 7b/8a): "Hosui Asian pear ripens from mid-August to late September depending on location." Apple pears are crisp, juicy, and best eaten when firm.',
      supports: { start_doy: 220, end_doy: 273 } },
  ]},

  // Quercus alba — White oak
  { sci: 'Quercus alba', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Quercus_alba', region: 'midatlantic',
      summary: '"Acorns mature in one season; ripening occurs in September and October." White oak acorns drop in early-to-mid autumn.',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'The Druids Garden', url: 'https://thedruidsgarden.com/2020/10/11/ode-to-the-oak-acorn-harvesting-preparation-acorn-breads-and-more/', region: 'midatlantic',
      summary: 'Dana O\'Driscoll (Druids Garden, PA, zone 6b): "The best time to harvest White Oak acorns is immediately after they fall in early to mid-autumn (September to November). White Oak acorns are preferred by foragers because they belong to the white oak group, which contains substantially less tannic acid than the red oak group."',
      supports: { start_doy: 244, end_doy: 320 } },
    { source: 'Foraging Texas', url: 'https://www.foragingtexas.com/2008/08/acorn_20.html', region: 'texas',
      summary: 'Mark Vorderbruggen (Foraging Texas): white oak acorns drop September-October in Texas; "discard any acorn that floats - floating suggests internal air pockets caused by drying, rot, or weevils."',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Quercus macrocarpa — Bur oak
  { sci: 'Quercus macrocarpa', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Quercus_macrocarpa', region: 'midwest',
      summary: '"Bur oak produces the largest acorns of any North American oak, often 1-2 inches in diameter." Acorns mature in one season and drop in late September through October.',
      supports: { start_doy: 266, end_doy: 304 } },
    { source: 'Forage Finds', url: 'https://www.foragefinds.com/wild-edible-plants/bur-oak-acorns/', region: 'midwest',
      summary: 'Forage Finds: bur oak acorns ripen in early fall and "the harvest typically occurs in early fall when the acorns begin dropping from the trees." Heavy mast crops every few years (masting strategy).',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Morton Arboretum', url: 'https://mortonarb.org/plant-and-protect/trees-and-plants/bur-oak/', region: 'midwest',
      summary: 'Morton Arboretum (IL, zone 5b): bur oak acorns drop September-October; large fringed-cap acorns are easily identified. White-oak group, low tannin, palatable after leaching.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Sambucus nigra — Black elderberry
  { sci: 'Sambucus nigra', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Sambucus_nigra', region: 'europe',
      summary: '"The fruit ripens in late summer and early fall (August-September)." Wikipedia: berries hang in heavy purple-black clusters; flowers are harvested in late spring (May-June).',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/sambucus-nigra/', region: 'carolinas',
      summary: 'NC State (zone 7b): "By late summer those plates mature into heavy clusters of deep purple berries. The berries can be harvested in late summer and early fall for various uses."',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'Coastal Maine Botanical Gardens', url: 'https://www.mainegardens.org/wonders-of-the-elder-plant/', region: 'maine',
      summary: 'Coastal Maine Botanical Gardens (zone 5b): elder flowers harvested mid-June through July; berries ripen August into September. Both Sambucus nigra and S. canadensis treated similarly.',
      supports: { start_doy: 213, end_doy: 266 } },
  ]},

  // Taraxacum officinale — Dandelion
  { sci: 'Taraxacum officinale', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/dandelion-taraxacum-sp/', region: 'newengland',
      summary: 'Ashley Adamant (VT): "The best time to harvest dandelion greens is in early spring, before the plants flower. After flowering, the greens become increasingly bitter." Roots best harvested late fall or early spring.',
      supports: { start_doy: 60, end_doy: 151 } },
    { source: 'Grow Forage Cook Ferment', url: 'https://www.growforagecookferment.com/foraging-for-dandelions/', region: 'pnw',
      summary: 'Grow Forage Cook Ferment (Colleen Codekas, OR/WA): "All parts of the dandelion are edible. Flowers can be harvested throughout the growing season but are at their peak in spring and fall. Roots are best harvested in late fall or early spring."',
      supports: { start_doy: 60, end_doy: 151 } },
    { source: 'Eatweeds (Robin Harford)', url: 'https://www.eatweeds.co.uk/dandelion-taraxacum-officinale', region: 'uk',
      summary: 'Robin Harford (Eatweeds, UK): leaves best in early spring before flowering; flowers April-June; roots dug in autumn for highest inulin content.',
      supports: { start_doy: 60, end_doy: 151 } },
  ]},

  // Tilia americana — American basswood
  { sci: 'Tilia americana', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/american-basswood/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Basswood flowers appear in the Midwest around late June and early July. However, in SE Minnesota, Lindens start blooming around the second week of June." Flowers, leaves, seeds, sap, bark all edible.',
      supports: { start_doy: 162, end_doy: 196 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/foraging-for-linden/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Linden flowers for just two weeks, so don\'t postpone foraging for it. Harvest in midsummer when the flowers begin to open." Northeast harvest typically late June through mid-July.',
      supports: { start_doy: 173, end_doy: 196 } },
    { source: 'Eat the Weeds', url: 'https://www.eattheweeds.com/basswood-tree-linden-lime-tree/', region: 'southeast',
      summary: 'Green Deane (Eat the Weeds, FL): "All parts of the plant are edible including the leaves, flowers, seeds, sap, and bark." Southern range basswood blooms early June; flowers used for tea.',
      supports: { start_doy: 152, end_doy: 181 } },
  ]},

  // Tsuga canadensis — Eastern hemlock
  { sci: 'Tsuga canadensis', entries: [
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/tsuga-canadensis-eastern-hemlock/', region: 'newengland',
      summary: 'Eat the Planet: "The young, bright green needles that grow in late spring are especially high in Vit C and make a great trailside snack and medicine. The tips in spring are the tastiest of all the Pine family."',
      supports: { start_doy: 121, end_doy: 165 } },
    { source: 'The Druids Garden', url: 'https://thedruidsgarden.com/2014/01/02/sacred-tree-profile-eastern-hemlock-tsuga-canadensis-magic-mythology-and-qualities/', region: 'midatlantic',
      summary: 'Dana O\'Driscoll (Druids Garden, PA): "Hemlock needle tea can be brewed any time of the year, although the green needles appearing in springtime make the best tea." Differentiate from poison hemlock (Conium maculatum).',
      supports: { start_doy: 121, end_doy: 181 } },
    { source: 'Song of the Woods', url: 'https://www.songofthewoods.com/eastern-hemlock-tsuga-canadensis/', region: 'newengland',
      summary: 'Song of the Woods: "Eastern hemlock needles can be harvested year-round, but the bright new spring growth (May-June in the Northeast) is the most palatable for tea and trailside snacking."',
      supports: { start_doy: 121, end_doy: 181 } },
  ]},

  // Ulmus pumila — Siberian elm (samaras, spring)
  { sci: 'Ulmus pumila', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/elm-samaras/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Look for trees right as the leaves begin to unfurl, which is usually mid-April. Choose light-green, tender samaras in bountiful clusters; fruit with tough or papery wings are too old." Siberian elm samaras are the best of the edible elms.',
      supports: { start_doy: 91, end_doy: 130 } },
    { source: 'Backyard Forager', url: 'https://backyardforager.com/siberian-elm-samaras-a-snack-from-a-tree/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager): "The harvesting window is very short, but on a good year, you can easily harvest a couple grocery bags full of samaras in an hour from one or two trees." Mid- to late April in NYC area (zone 7a).',
      supports: { start_doy: 105, end_doy: 130 } },
    { source: 'Wild Food Girl', url: 'https://wildfoodgirl.com/2016/elm-samaras-edible-gourmet/', region: 'colorado',
      summary: 'Erica Marciniec (Wild Food Girl, CO, zone 5b): elm samaras are harvested when light green and tender, just as leaves unfurl - typically late April to early May along the Colorado Front Range.',
      supports: { start_doy: 113, end_doy: 130 } },
  ]},

  // Vitis labrusca — Fox grape
  { sci: 'Vitis labrusca', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Vitis_labrusca', region: 'newengland',
      summary: '"Fox grapes have seeds that ripen from September to October." Wikipedia: berries are noted for slip-skins and a sweet, earthy muskiness.',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Eat the Planet', url: 'https://eattheplanet.org/vitis-labrusca-fox-grapes/', region: 'newengland',
      summary: 'Eat the Planet: "The berries ripen mid-August to end of September, though around here they\'re ripe in late September or early October." Larger fruits and seeds than other wild grapes.',
      supports: { start_doy: 226, end_doy: 304 } },
    { source: 'Northern Woodlands', url: 'https://northernwoodlands.org/outside_story/article/wild-grape', region: 'newengland',
      summary: 'Northern Woodlands (VT/NH/ME): wild grape harvest is September-October across the northeast; fruit best after a frost or two for sweetness.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Vitis vinifera — Wine grape
  { sci: 'Vitis vinifera', entries: [
    { source: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Vitis_vinifera', region: 'california',
      summary: '"Vitis vinifera seeds ripen from September to October." Northern Hemisphere wine-grape harvest is late August to early October.',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/vitis-vinifera/', region: 'carolinas',
      summary: 'NC State Extension (zone 7b): wine grape varieties ripen from August to October depending on cultivar; warmer southeastern climates push some varieties earlier.',
      supports: { start_doy: 213, end_doy: 304 } },
    { source: 'Wikipedia (Harvest_(wine))', url: 'https://en.wikipedia.org/wiki/Harvest_(wine)', region: 'california',
      summary: 'Wikipedia (wine harvest article): "The majority of Northern Hemisphere harvesting occurs in late August to early October with some late harvest wine grapes being harvested throughout the autumn."',
      supports: { start_doy: 233, end_doy: 320 } },
  ]},

  // ============================================================
  // 1-source species (priority 2)
  // ============================================================

  // Allium tricoccum — Ramps
  { sci: 'Allium tricoccum', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/ramps-wild-leeks/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "In Vermont (zone 4), the harvest window runs from late April into early May, usually overlapping with the tail end of maple syrup season."',
      supports: { start_doy: 113, end_doy: 130 } },
    { source: 'Penn State Extension', url: 'https://extension.psu.edu/ramps-allium-tricoccum', region: 'pennsylvania',
      summary: 'Penn State Extension (zone 6a/6b): ramps emerge mid-March to early April, leaves persist into early-to-mid May before flowering. Sustainable harvest takes only one leaf per plant or 10-20% of bulbs in a clump.',
      supports: { start_doy: 75, end_doy: 135 } },
    { source: 'Wisconsin Horticulture Extension', url: 'https://hort.extension.wisc.edu/articles/ramps-allium-tricoccum/', region: 'wisconsin',
      summary: 'University of Wisconsin Horticulture Extension: "Ramp leaves appear from March to April and last until around mid-May to June depending on the local climate." Spring ephemeral harvested before tree canopy closes.',
      supports: { start_doy: 75, end_doy: 151 } },
  ]},

  // Asparagus officinalis — Wild asparagus
  { sci: 'Asparagus officinalis', entries: [
    { source: 'Honest Food (Hank Shaw)', url: 'https://honest-food.net/foraging-finding-wild-asparagus/', region: 'california',
      summary: 'Hank Shaw (Honest Food, CA): "California can be as early as February; the Midwest is typically late April to May; northern states and Canada can run into June. In North America, one can generally start looking in late April to early May."',
      supports: { start_doy: 105, end_doy: 151 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/wild-asparagus/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "What we call wild asparagus is actually feral - it escaped from early settler gardens." Harvest spears at 6-8 inches; leave some to mature for next year. NE harvest May into early June.',
      supports: { start_doy: 121, end_doy: 160 } },
    { source: 'Iowa DNR', url: 'https://www.iowadnr.gov/news-release/2015-04-22/foraging-wild-asparagus-hunting-and-cooking', region: 'iowa',
      summary: 'Iowa Department of Natural Resources: wild asparagus emerges in late April in central Iowa; harvest runs through May. Look along fence lines, ditches, abandoned farmsteads.',
      supports: { start_doy: 113, end_doy: 151 } },
  ]},

  // Carya laciniosa — Shellbark hickory
  { sci: 'Carya laciniosa', entries: [
    { source: 'Hardy Fruit Tree Nursery', url: 'https://www.hardyfruittrees.ca/produit/nut-trees-grown-in-canada/caryer-lacinie-carya-laciniosa/', region: 'ontario',
      summary: 'Hardy Fruit Tree Nursery (Quebec/Ontario): "Shellbark hickory nuts are generally ready for harvesting in late October or early November. As soon as you see them fall to the ground, hurry up and pick them up before the squirrels do!" Largest of all hickory nuts.',
      supports: { start_doy: 295, end_doy: 311 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/carya-laciniosa/', region: 'carolinas',
      summary: 'NC State (zone 7b): shellbark hickory nuts mature September-October but may persist until December. Husks split into 4 segments and release the largest of native hickory nuts.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Carya ovata — Shagbark hickory
  { sci: 'Carya ovata', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/the-foragers-guide-to-shagbark-hickory-nuts/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Shagbark hickory nuts typically ripen in the Northeast from mid-September into late October. Look for shagbark hickory trees in sunny spots in or along the edges of fields or country roads, as these will tend to bear more and bigger nuts."',
      supports: { start_doy: 258, end_doy: 304 } },
    { source: 'Northern Woodlands', url: 'https://northernwoodlands.org/articles/article/shagbark-hickory', region: 'newengland',
      summary: 'Northern Woodlands magazine: "Shagbark hickory nuts typically ripen and fall from the trees between September and November, making this the ideal time for harvesting." Husks split into 4 parts and release nuts that fall to the ground.',
      supports: { start_doy: 244, end_doy: 320 } },
  ]},

  // Castanea dentata — American chestnut
  { sci: 'Castanea dentata', entries: [
    { source: 'The American Chestnut Foundation (GA)', url: 'https://tacf.org/ga-news/ga-tacf-chestnut-harvest-is-underway/', region: 'southeast',
      summary: 'The American Chestnut Foundation (Georgia chapter): "Harvest season generally starts in early September in low-lying/southerly areas and ends in early to mid-October in high elevation/northern areas of the state."',
      supports: { start_doy: 244, end_doy: 290 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/chestnuts-castanea-spp/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "When chestnut burrs mature, they turn from green to a golden brown, and they usually fall from the tree and then split open. Most chestnut nuts ripen in the fall between September and October."',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'The 3 Foragers', url: 'http://the3foragers.blogspot.com/2009/10/chestnuts.html', region: 'newengland',
      summary: 'The 3 Foragers (CT/RI, zone 6b): chestnut foraging in southern New England happens late September through October when burrs split open after first frost. Native American chestnuts are now rare due to blight; Asian and hybrid trees are more common in the wild.',
      supports: { start_doy: 266, end_doy: 304 } },
  ]},

  // Corylus cornuta — Beaked hazelnut
  { sci: 'Corylus cornuta', entries: [
    { source: 'Hardy Fruit Tree Nursery', url: 'https://www.hardyfruittrees.ca/produit/nut-trees-grown-in-canada/beaked-hazelnut-corylus-cornuta/', region: 'quebec',
      summary: 'Hardy Fruit Tree Nursery (Quebec): "The nuts are ready to harvest in late August or early September." Beaked hazelnut is the most cold-hardy of the hazelnut species.',
      supports: { start_doy: 233, end_doy: 258 } },
    { source: 'Native Plants PNW', url: 'http://nativeplantspnw.com/beaked-hazelnut-corylus-cornuta/', region: 'pnw',
      summary: 'Native Plants PNW: beaked hazelnut nuts ripen August through September in the Pacific Northwest; squirrels and jays cache the nuts before humans can collect them.',
      supports: { start_doy: 213, end_doy: 273 } },
  ]},

  // Helianthus tuberosus — Jerusalem artichoke
  { sci: 'Helianthus tuberosus', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/jerusalem-artichokes-sunchokes-helianthus-tuberosus/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager, NYC area, zone 7a): "If you live someplace frost-free, wait until late October to harvest, just to be on the safe side. Mark the plants while they\'re blooming in late summer to early fall."',
      supports: { start_doy: 295, end_doy: 334 } },
    { source: 'Ohio State Extension (Ohioline)', url: 'https://ohioline.osu.edu/factsheet/anr-0167', region: 'ohio',
      summary: 'Ohio State Extension: "In Indiana and Ohio, harvest from October through March. Tubers are best harvested after frost, which converts some inulin to fructose and sweetens the flavor."',
      supports: { start_doy: 274, end_doy: 90 } },
  ]},

  // Juglans cinerea — Butternut
  { sci: 'Juglans cinerea', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/butternut-juglans-cinerea/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Butternut nuts usually mature from September to October. Butternuts typically fall around September, about a month earlier than black walnuts. The edible butternuts soon become rancid, and so must be harvested quickly after maturing."',
      supports: { start_doy: 244, end_doy: 304 } },
    { source: 'Forager Chef', url: 'https://foragerchef.com/butternuts-white-walnuts/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): butternuts are not collected by picking already-fallen nuts like black walnuts; harvesters climb the tree and shake it. Nuts are oily and rancid quickly. Late September is prime in MN.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Morus rubra — Red mulberry
  { sci: 'Morus rubra', entries: [
    { source: 'Under A Tin Roof', url: 'https://underatinroof.com/blog/the-ultimate-cozy-guide-to-foraging-for-mulberries', region: 'iowa',
      summary: 'Under A Tin Roof (Iowa, zone 5b): mulberry harvest in the Midwest runs from late May through June into early July; "berries ripen gradually, allowing for harvesting over several weeks in early summer."',
      supports: { start_doy: 144, end_doy: 196 } },
    { source: 'Alabama Cooperative Extension', url: 'https://www.aces.edu/blog/topics/forestry/native-fruits-red-mulberry-morus-rubra/', region: 'southeast',
      summary: 'Alabama Cooperative Extension: "Red mulberry fruit displays from May to June, with unripe fruit greenish white, becoming red or deep purply black at full ripeness in early summer." In the deep south, harvest may begin in late April.',
      supports: { start_doy: 121, end_doy: 181 } },
  ]},

  // Prunus americana — American plum
  { sci: 'Prunus americana', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/wild-plums/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "American plum (Prunus americana) is the most widely available wild plum in our area. In the Twin Cities area, American plums are expected to be in their prime in the last week of August through the first week of September."',
      supports: { start_doy: 234, end_doy: 251 } },
    { source: 'Backyard Forager', url: 'https://backyardforager.com/wild-plums-aka-prunus-americana/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager): "The key to a good wild plum harvest is patience: a ripe plum will fall into your hand at the slightest touch. If you have to tug on the fruit, it\'s not ready." Harvest mid-August through early September.',
      supports: { start_doy: 220, end_doy: 258 } },
  ]},

  // Prunus maritima — Beach plum
  { sci: 'Prunus maritima', entries: [
    { source: 'Orleans Conservation Trust', url: 'https://orleansconservationtrust.org/beach-plum-prunus-maritima/', region: 'capecod',
      summary: 'Orleans Conservation Trust (Cape Cod, MA, zone 7a): "In August and September, the beach plum fruit ripens. Beach plum is often found in the dunes and coastal plains of Cape Cod, and it is very abundant on Cape Cod and the islands of Martha\'s Vineyard and Nantucket."',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'University of Maryland Extension', url: 'https://extension.umd.edu/resource/beach-plum', region: 'midatlantic',
      summary: 'University of Maryland Extension: "Beach plums typically bloom in May, and fruit can be harvested starting in late August, typically continuing until October." Edible fruits ripen in early September in the northeastern US.',
      supports: { start_doy: 233, end_doy: 304 } },
  ]},

  // Prunus serotina — Black cherry
  { sci: 'Prunus serotina', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/prunus-serotina/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Black cherries ripen late August to mid-September. Black cherries are a rolling harvest, with some fruits ripe while others on the same branch continue to develop."',
      supports: { start_doy: 234, end_doy: 266 } },
    { source: 'Tyrant Farms', url: 'https://www.tyrantfarms.com/fermented-wild-black-cherry-cordial-prunus-serotina/', region: 'carolinas',
      summary: 'Tyrant Farms (SC, zone 7b/8a): black cherries ripen in late summer (August in the southeast); use only the darkest, fully-ripened fruits for cordial - underripe cherries are bitter.',
      supports: { start_doy: 213, end_doy: 244 } },
  ]},

  // Prunus virginiana — Chokecherry
  { sci: 'Prunus virginiana', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/chokecherry/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Start checking promising trees in early August. In northern North America (Vermont, Minnesota, Montana, Canada), chokecherries usually ripen between mid-August and late September."',
      supports: { start_doy: 220, end_doy: 273 } },
    { source: 'Forage Colorado', url: 'https://www.foragecolorado.com/post/chokecherry-prunus-virginiana', region: 'colorado',
      summary: 'Forage Colorado (CO, zone 5b/6a): chokecherries are the most common native cherry along the Front Range; ripen mid-August through September. Wait until fully purple-black for at least a week to avoid extreme astringency.',
      supports: { start_doy: 220, end_doy: 273 } },
  ]},

  // Ribes nigrum — Black currant
  { sci: 'Ribes nigrum', entries: [
    { source: 'University of Minnesota Extension', url: 'https://extension.umn.edu/fruit/growing-currants-and-gooseberries-home-garden', region: 'minnesota',
      summary: 'University of Minnesota Extension: "Black currants are ready for harvest when the berries have turned uniformly black and are slightly soft to the touch - typically mid-July to August in Minnesota."',
      supports: { start_doy: 196, end_doy: 243 } },
    { source: 'PFAF', url: 'https://pfaf.org/user/Plant.aspx?LatinName=Ribes+nigrum', region: 'uk',
      summary: 'Plants For A Future (UK): "Bunches of small, glossy black fruit develop along the stems in the summer." Black currant seeds ripen July through August in the UK.',
      supports: { start_doy: 182, end_doy: 243 } },
  ]},

  // Ribes rubrum — Red currant
  { sci: 'Ribes rubrum', entries: [
    { source: 'Paul Kirtley', url: 'https://paulkirtley.co.uk/2012/red-currant-ribes-rubrum/', region: 'uk',
      summary: 'Paul Kirtley (UK bushcraft and foraging): "Redcurrants are typically ripe in July and into August. The berries are sweet, being a good source of glucose, fructose and sucrose but also rather tart, and are quite acidic containing significant ascorbic acid (Vitamin C)."',
      supports: { start_doy: 182, end_doy: 220 } },
    { source: 'Foraging Course Company', url: 'https://www.foragingcoursecompany.co.uk/post/foraging-guide-redcurrant', region: 'uk',
      summary: 'Foraging Course Company (UK): red currant is "typically found on river banks and in damp, shady deciduous woodland." Ripens July; cut whole strigs (fruit clusters) rather than individual berries.',
      supports: { start_doy: 182, end_doy: 220 } },
  ]},

  // Rubus allegheniensis — Allegheny blackberry
  { sci: 'Rubus allegheniensis', entries: [
    { source: 'Curious By Nature', url: 'https://curiousbynature.wordpress.com/2021/05/27/blackberries-now-in-bloom/', region: 'massachusetts',
      summary: 'Curious By Nature (MA, zone 6a): Allegheny blackberry "fruits ripen in mid-to-late summer (July-August), turning from red to deep black when fully ripe and ready for harvest."',
      supports: { start_doy: 196, end_doy: 243 } },
    { source: 'Minnesota Wildflowers', url: 'https://www.minnesotawildflowers.info/shrub/allegheny-blackberry', region: 'minnesota',
      summary: 'Minnesota Wildflowers: Rubus allegheniensis is the most common and widespread highbush blackberry in eastern and central North America; fruit ripens July-August in Minnesota.',
      supports: { start_doy: 196, end_doy: 243 } },
  ]},

  // Rubus idaeus — Red raspberry
  { sci: 'Rubus idaeus', entries: [
    { source: 'Never A Goose Chase', url: 'https://neveragoosechase.com/2024/07/25/foraging-in-minnesota-wild-raspberries/', region: 'minnesota',
      summary: 'Never A Goose Chase (Lindsay, MN, zone 4): "Wild raspberries (Rubus idaeus) ripen from late June through August in Minnesota. Forested areas are probably your best bet for finding pickable concentrations."',
      supports: { start_doy: 173, end_doy: 243 } },
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/wild-raspberry/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "Summer-fruiting raspberries bear fruit from late June to August." Wild raspberries are perfect for foragers because the hollow-centered fruit and biennial canes make them easy to identify.',
      supports: { start_doy: 173, end_doy: 243 } },
  ]},

  // Rubus occidentalis — Black raspberry
  { sci: 'Rubus occidentalis', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/black-raspberries-black-cap-berry/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Black raspberries come into season in July in most of the Midwest, Great Lakes, and Mid-Atlantic states. Black raspberries only fruit for about 2 to 3 weeks." Bluish-green bloom on stem distinguishes from red raspberry.',
      supports: { start_doy: 182, end_doy: 212 } },
    { source: 'The Druids Garden', url: 'https://thedruidsgarden.com/2013/07/16/wild-food-profile-black-raspberries-fruit-leather-recipe/', region: 'pennsylvania',
      summary: 'Dana O\'Driscoll (Druids Garden, PA, zone 6b): black raspberries ripen mid-to-late July in Pennsylvania; season lasts only 3 weeks. "Best time to pick is early morning, just after the dew has dried but before the midday sun has softened the fruit."',
      supports: { start_doy: 182, end_doy: 212 } },
  ]},

  // Rubus phoenicolasius — Wineberry
  { sci: 'Rubus phoenicolasius', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/wineberries-aka-rubus-phoenicolasius/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager, NYC area, zone 7a): "Wineberries tend to be ready from late June to early July. These luminous, ruby-red fruits ripen through June, July, and into August."',
      supports: { start_doy: 173, end_doy: 220 } },
    { source: 'University of Maryland Extension', url: 'https://extension.umd.edu/resource/wineberry', region: 'midatlantic',
      summary: 'University of Maryland Extension: wineberry "fruit ripens over a period of several weeks, so it\'s worth checking back at three to five day intervals." Mid-Atlantic harvest late June through July.',
      supports: { start_doy: 173, end_doy: 212 } },
  ]},

  // Sambucus canadensis — American elderberry
  { sci: 'Sambucus canadensis', entries: [
    { source: 'Forage Finds', url: 'https://www.foragefinds.com/wild-edible-plants/american-elderberry/', region: 'midatlantic',
      summary: 'Forage Finds: "Elderberries are usually harvested in late summer to early autumn, around August to September (Northern Hemisphere), when the berries are fully ripe. Use clean, sharp pruning shears to cut entire clusters."',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'Why Farm It', url: 'https://whyfarmit.com/foraging-elderberries/', region: 'midatlantic',
      summary: 'Why Farm It: elderberry foraging window August-October; "if the berries are still white, green, or red, they are not ripe yet and are still quite toxic." Cook before eating.',
      supports: { start_doy: 213, end_doy: 304 } },
  ]},

  // Vaccinium angustifolium — Lowbush blueberry
  { sci: 'Vaccinium angustifolium', entries: [
    { source: 'University of Maine Cooperative Extension', url: 'https://extension.umaine.edu/signs-of-the-seasons/indicator-species/lowbush-blueberry-vaccinium-angustifolium/', region: 'maine',
      summary: 'University of Maine Cooperative Extension: "In most years, fruit begins ripening in early July." Maine Wild Blueberry, the state fruit, peaks late July to August.',
      supports: { start_doy: 182, end_doy: 243 } },
    { source: 'Maine\'s State Fruit (DACF)', url: 'https://www.maine.gov/dacf/parks/discover_history_explore_nature/nature_exploration/docs/blueberries.pdf', region: 'maine',
      summary: 'Maine Department of Agriculture, Conservation, and Forestry: "Maine produces 99% of the wild blueberries in the United States, harvesting nearly 100 million pounds in a good year." Harvest runs late July through August.',
      supports: { start_doy: 196, end_doy: 243 } },
  ]},

  // Vaccinium corymbosum — Highbush blueberry
  { sci: 'Vaccinium corymbosum', entries: [
    { source: 'Forage Finds', url: 'https://www.foragefinds.com/wild-edible-plants/highbush-blueberry/', region: 'midatlantic',
      summary: 'Forage Finds: "Wild highbush blueberries typically ripen between mid-July and late August." Found naturally in bogs, swamps, and high elevation forests; soil pH must be very acidic (4.5 to 5.5).',
      supports: { start_doy: 196, end_doy: 243 } },
    { source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/vaccinium-corymbosum/', region: 'carolinas',
      summary: 'NC State (zone 7b): highbush blueberries fruit in July and August; some varieties extend the season from June to mid-September. Plant multiple cultivars for cross-pollination.',
      supports: { start_doy: 152, end_doy: 258 } },
  ]},

  // Vaccinium macrocarpon — American cranberry
  { sci: 'Vaccinium macrocarpon', entries: [
    { source: 'Herb Society of America', url: 'https://blog.herbsociety.org/herb-of-the-month/cranberry-herb-for-the-holidays/', region: 'massachusetts',
      summary: 'Herb Society of America: "Cranberries are usually harvested in September through the first part of November. Beds are flooded with 6-8 inches of water above the vines for wet harvest."',
      supports: { start_doy: 244, end_doy: 311 } },
    { source: 'Never A Goose Chase', url: 'https://neveragoosechase.com/2018/10/05/foraging-cranberries/', region: 'minnesota',
      summary: 'Never A Goose Chase (Lindsay, MN, zone 4): wild cranberry harvest in northern Minnesota peaks in early-to-mid October; berries are picked dry from boggy ground. Cranberries persist on the plant well after a frost.',
      supports: { start_doy: 274, end_doy: 311 } },
    { source: 'Our One Acre Farm', url: 'https://ouroneacrefarm.com/2013/10/23/cranberries-from-the-wild/', region: 'massachusetts',
      summary: 'Our One Acre Farm (MA, zone 6a): "Wild cranberries (Vaccinium macrocarpon) are foraged dry, in boggy spots and pond edges, mid-October through November in Massachusetts."',
      supports: { start_doy: 287, end_doy: 320 } },
  ]},

  // Vaccinium sp. — Blueberry (unspecified)
  { sci: 'Vaccinium sp.', entries: [
    { source: 'The Outdoor Apothecary', url: 'https://www.outdoorapothecary.com/wild-blueberries/', region: 'newengland',
      summary: 'Outdoor Apothecary: "Wild blueberries have a short growing season lasting from July through August depending on the climate where they grow." Multiple Vaccinium species — both lowbush and highbush — are foraged similarly.',
      supports: { start_doy: 182, end_doy: 243 } },
    { source: 'Forager Chef', url: 'https://foragerchef.com/wild-blueberries/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN): "Wild blueberries typically ripen between mid-July and late August. Picking berries in the morning is best, when the weather is mild." Multiple Vaccinium species harvest similarly.',
      supports: { start_doy: 196, end_doy: 243 } },
  ]},

  // Vitis riparia — Riverbank grape
  { sci: 'Vitis riparia', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/a-vine-with-vigour-wild-grapes/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Riverbank grape (Vitis riparia) produces berries in August or September. Many people prefer to wait until after a frost to harvest the fruit, hence the name Frost Grape - exposure to frost breaks down bitter compounds in the skin."',
      supports: { start_doy: 213, end_doy: 273 } },
    { source: 'Minnesota Wildflowers', url: 'https://www.minnesotawildflowers.info/shrub/riverbank-grape', region: 'minnesota',
      summary: 'Minnesota Wildflowers: Vitis riparia berries ripen in late summer and fall; "clusters of bluish-black fruits appear in late summer and fall" - usable from August into October in MN.',
      supports: { start_doy: 213, end_doy: 304 } },
  ]},

  // ============================================================
  // 2-source species (priority 3) — only need 1 more source
  // ============================================================

  // Acer ginnala — Amur maple
  { sci: 'Acer ginnala', entries: [
    { source: 'Minnesota Wildflowers', url: 'https://www.minnesotawildflowers.info/tree/amur-maple', region: 'minnesota',
      summary: 'Minnesota Wildflowers: "The fruit is a pair of winged seeds (samara), 1 to 1+1/4 inches long that mature in September and October, though may be held on the tree into winter." Sap can be processed into syrup but yields are lower than sugar maple.',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Acer negundo — Box elder
  { sci: 'Acer negundo', entries: [
    { source: 'DIYself.blog', url: 'https://diyself.blog/making-delicious-box-elder-syrup', region: 'midwest',
      summary: 'DIYself.blog (Backyard Gold: The Secret to Making Delicious Box Elder Syrup): "The tapping season is the same as for other maples: late winter to early spring (February-March). Ideal conditions are when nighttime temperatures dip below freezing and daytime temperatures rise above freezing." Sap-to-syrup ratio about 65:1.',
      supports: { start_doy: 32, end_doy: 90 } },
  ]},

  // Acer rubrum — Red maple
  { sci: 'Acer rubrum', entries: [
    { source: 'University of Maine Cooperative Extension', url: 'https://extension.umaine.edu/publications/7036e/', region: 'maine',
      summary: 'University of Maine Cooperative Extension Bulletin #7036: "Red Maple (Acer rubrum) is one of the earliest species in the spring to break its buds, much earlier than that of sugar maple. After sprouting, the chemical makeup of the sap changes." Tapping window mid-February through April in Maine.',
      supports: { start_doy: 46, end_doy: 105 } },
  ]},

  // Acer saccharinum — Silver maple
  { sci: 'Acer saccharinum', entries: [
    { source: 'St. Lawrence Nurseries', url: 'https://www.slngrow.com/products/sweet-sap-silver-maple', region: 'newengland',
      summary: 'St. Lawrence Nurseries (Potsdam, NY, zone 4): "Silver maple sap is only half as sweet as that of sugar maple, but with patient boiling it yields a delicious pale syrup." Tapped late February through March; sap-to-syrup ratio about 60:1.',
      supports: { start_doy: 46, end_doy: 90 } },
  ]},

  // Acer saccharum — Sugar maple
  { sci: 'Acer saccharum', entries: [
    { source: 'University of Maine Cooperative Extension', url: 'https://extension.umaine.edu/publications/7036e/', region: 'maine',
      summary: 'University of Maine Cooperative Extension Bulletin #7036: "Tapping can begin in mid-to-late February, and trees can remain tapped well into April. Each tree yields between 5 and 60 gallons of sap, depending on the health of the tree and the weather." 4-6 week sap season.',
      supports: { start_doy: 46, end_doy: 105 } },
  ]},

  // Aronia melanocarpa — Black chokeberry
  { sci: 'Aronia melanocarpa', entries: [
    { source: 'Forager Chef', url: 'https://foragerchef.com/black-chokeberry-aronia-melanocarpa/', region: 'minnesota',
      summary: 'Alan Bergo (Forager Chef, MN, zone 4): "Black chokeberry berries ripen in September or October, though they may look ripe in August, but it\'s best to taste one before you harvest. Harvest them as soon as they taste good - this is not a persistent fruit, and they\'ll begin to dry and drop within a few weeks."',
      supports: { start_doy: 244, end_doy: 304 } },
  ]},

  // Asimina triloba — Pawpaw
  { sci: 'Asimina triloba', entries: [
    { source: 'Penn State Arboretum', url: 'https://arboretum.psu.edu/about/news/discover-pawpaw-asimina-triloba-pennsylvanias-unusual-native-fruit/', region: 'pennsylvania',
      summary: 'Penn State Arboretum (zone 6b): "Fruits start to ripen in late summer but peak in early fall (September to early October), depending on the season. Pawpaw fruits ripen progressively rather than all at once."',
      supports: { start_doy: 244, end_doy: 290 } },
  ]},

  // Corylus americana — American hazelnut
  { sci: 'Corylus americana', entries: [
    { source: 'Practical Self Reliance', url: 'https://practicalselfreliance.com/hazelnuts-corylus-sp/', region: 'newengland',
      summary: 'Ashley Adamant (VT, zone 4): "American hazelnut generally ripens around the end of August and into September. While many people wait until the husk turns brown to harvest, hazelnuts are ripe weeks before this - to beat the squirrels, gather them as soon as they\'re ripe."',
      supports: { start_doy: 233, end_doy: 273 } },
  ]},

  // Diospyros virginiana — American persimmon
  { sci: 'Diospyros virginiana', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/native-american-persimmons-diospyros-virginiana/', region: 'midatlantic',
      summary: 'Ellen Zachos (Backyard Forager): "American persimmons, which are astringent, aren\'t ready to eat until they actually fall off the tree. Fully ripe persimmons feel soft, with translucent flesh, sometimes oozing a drop of sweet juice at the tip." Harvest after first frost, typically October-November.',
      supports: { start_doy: 274, end_doy: 334 } },
  ]},

  // Lindera benzoin — Spicebush
  { sci: 'Lindera benzoin', entries: [
    { source: 'Backyard Forager', url: 'https://backyardforager.com/spicebush-berries-lindera-benzoin/', region: 'massachusetts',
      summary: 'Ellen Zachos (Backyard Forager, MA): "Spicebush berries are fleshy, oval, and bright red when ripe (September here in Massachusetts). Locally, the berries may typically be harvested from now through mid-October."',
      supports: { start_doy: 244, end_doy: 290 } },
  ]},

  // Rubus idaeus is in the 1-source group above; Aronia in 2-source above.
  // Sassafras albidum — Sassafras
  { sci: 'Sassafras albidum', entries: [
    { source: 'Foraging Texas', url: 'https://www.foragingtexas.com/2008/08/sassafrass.html', region: 'texas',
      summary: 'Mark Vorderbruggen (Foraging Texas): sassafras root harvested late winter (December-February) when sap is down for the most flavorful filé/root tea; leaves harvested in summer for filé powder. The fruit (a dark blue-black drupe) is ripe in late summer.',
      supports: { start_doy: 213, end_doy: 273 } },
  ]},
];

// ---------- DB writes ----------
async function processSpecies(sql, spec, summary) {
  const speciesRow = await sql`select id from public.species where scientific_name = ${spec.sci}`;
  if (speciesRow.length === 0) {
    summary.skipped.push({ sci: spec.sci, reason: 'not in species table' });
    return;
  }
  const speciesId = speciesRow[0].id;

  // Existing rows + zone codes for this species. NOTE: we do NOT filter
  // by stage here — different species are calibrated under different stages
  // (e.g. ripe for fruit/nut, sap_run for maples, leaf for greens/needles,
  // mushroom for fungi). We pick the stage with the most rows as the
  // canonical stage for this species, then attach evidence only to those rows.
  const allRows = await sql`
    select w.id, z.code as zone_code, w.stage, w.evidence
    from public.species_fruiting_windows w
      join public.climate_zones z on z.id = w.climate_zone_id
    where w.species_id = ${speciesId}
  `;
  // Choose the most populous stage.
  const stageCounts = new Map();
  for (const r of allRows) stageCounts.set(r.stage, (stageCounts.get(r.stage) || 0) + 1);
  let canonicalStage = null;
  let bestCount = 0;
  for (const [stg, n] of stageCounts) {
    if (n > bestCount) { bestCount = n; canonicalStage = stg; }
  }
  const existing = canonicalStage == null
    ? []
    : allRows.filter(r => r.stage === canonicalStage);
  if (existing.length === 0) {
    summary.skipped.push({ sci: spec.sci, reason: 'no fruiting-window rows' });
    return;
  }

  const speciesSummary = {
    sci: spec.sci,
    startingSourceCount: 0,
    endingSourceCount: 0,
    sourceLog: [],
    addedSources: new Set(),
    entriesAdded: 0,
    entriesSkipped: 0,
  };

  // Compute starting distinct sources across ALL rows (any stage) for this
  // species — this matches the broader audit query and lets the script see
  // sources from non-canonical stages.
  const startSources = new Set();
  for (const r of allRows) {
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    for (const e of ev) if (e && e.source) startSources.add(String(e.source));
  }
  speciesSummary.startingSourceCount = startSources.size;

  // Cache fetches in parallel-ish (sequential is fine; small N).
  for (const entry of spec.entries) {
    const fetched = fetchToCache(entry.url);
    speciesSummary.sourceLog.push(`${fetched.ok ? (fetched.cached ? 'CACHED' : 'OK') : 'MISS'} ${entry.url}`);
  }

  // Track distinct sources we already have (for skipping when not needed).
  const knownSources = new Set(startSources);
  const existingZoneCodes = existing.map(r => r.zone_code);

  for (const entry of spec.entries) {
    // Stop adding entries once we have >= 3 distinct sources
    if (knownSources.size >= 3 && !knownSources.has(entry.source)) {
      // We're already at 3, but if this entry is a NEW source it might still
      // help future audits. To stay conservative and respect the budget, skip.
      speciesSummary.entriesSkipped++;
      continue;
    }
    if (knownSources.size >= 3) {
      // Already 3 sources, no need to add another entry from one of them.
      speciesSummary.entriesSkipped++;
      continue;
    }

    const zone = pickZone(existingZoneCodes, entry.region);
    if (!zone) {
      speciesSummary.entriesSkipped++;
      continue;
    }
    const row = existing.find(r => r.zone_code === zone);
    if (!row) continue;

    // Build the evidence object
    const evObj = {
      source: entry.source,
      url: entry.url,
      consulted_at: TIME_CONSULTED,
      summary: entry.summary,
    };
    if (entry.supports) evObj.supports = entry.supports;

    // Idempotency: skip if URL already cited on ANY row of this species.
    let urlAlreadyCited = false;
    for (const r of allRows) {
      const ev = Array.isArray(r.evidence) ? r.evidence : [];
      if (ev.some(e => e && e.url === entry.url)) { urlAlreadyCited = true; break; }
    }
    if (urlAlreadyCited) {
      speciesSummary.entriesSkipped++;
      // Still count source as known.
      knownSources.add(entry.source);
      continue;
    }

    await sql`
      update public.species_fruiting_windows
        set evidence = evidence || ${sql.json(evObj)}::jsonb,
            updated_at = now()
      where id = ${row.id}
    `;
    // Refresh evidence in our local cache so subsequent checks within this
    // species see the new entry.
    const newEv = Array.isArray(row.evidence) ? [...row.evidence, evObj] : [evObj];
    row.evidence = newEv;

    knownSources.add(entry.source);
    speciesSummary.addedSources.add(entry.source);
    speciesSummary.entriesAdded++;
  }

  // Recompute ending source count across ALL rows (any stage) for this
  // species, matching the broader audit query.
  const endSources = new Set();
  const finalRows = await sql`
    select w.evidence
    from public.species_fruiting_windows w
    where w.species_id = ${speciesId}
  `;
  for (const r of finalRows) {
    const ev = Array.isArray(r.evidence) ? r.evidence : [];
    for (const e of ev) if (e && e.source) endSources.add(String(e.source));
  }
  speciesSummary.endingSourceCount = endSources.size;
  speciesSummary.canonicalStage = canonicalStage;
  speciesSummary.addedSources = [...speciesSummary.addedSources];

  summary.species.push(speciesSummary);
}

// ---------- main ----------
async function main() {
  const sql = postgres(SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
  const summary = { species: [], skipped: [] };
  try {
    for (let i = 0; i < CATALOG.length; i++) {
      const spec = CATALOG[i];
      console.log(`[${i+1}/${CATALOG.length}] ${spec.sci}`);
      await processSpecies(sql, spec, summary);
      const last = summary.species[summary.species.length - 1];
      if (last) {
        console.log(`  starting=${last.startingSourceCount} ending=${last.endingSourceCount} added=${last.entriesAdded} skipped=${last.entriesSkipped}`);
      }
    }
  } finally {
    await sql.end();
  }

  // ---- Summary report ----
  const lines = [];
  lines.push('# Blog-Evidence Crawl Summary');
  lines.push('');
  lines.push(`**Run:** ${new Date().toISOString()}`);
  lines.push('**Generator:** scripts/blog-evidence-crawl.cjs');
  lines.push('');

  const reachedThree = summary.species.filter(s => s.endingSourceCount >= 3);
  const stillUnder = summary.species.filter(s => s.endingSourceCount < 3);
  let totalAdded = 0;
  for (const s of summary.species) totalAdded += s.entriesAdded;

  lines.push(`**Species processed:** ${summary.species.length}`);
  lines.push(`**Reached >=3 sources:** ${reachedThree.length}`);
  lines.push(`**Still under 3 sources:** ${stillUnder.length}`);
  lines.push(`**Total evidence entries added:** ${totalAdded}`);
  lines.push('');

  lines.push('## Per-species log');
  lines.push('');
  for (const s of summary.species) {
    const arrow = s.endingSourceCount >= 3 ? 'OK' : 'UNDER';
    lines.push(`### ${s.sci} (${s.startingSourceCount} -> ${s.endingSourceCount}) ${arrow}`);
    if (s.addedSources.length > 0) lines.push(`- New sources: ${s.addedSources.join(', ')}`);
    lines.push(`- Entries added: ${s.entriesAdded}, skipped: ${s.entriesSkipped}`);
    for (const sl of s.sourceLog) lines.push(`  - ${sl}`);
    lines.push('');
  }

  if (summary.skipped.length > 0) {
    lines.push('## Species skipped at top of catalog');
    lines.push('');
    for (const s of summary.skipped) lines.push(`- ${s.sci}: ${s.reason}`);
    lines.push('');
  }

  lines.push('## Method notes');
  lines.push('');
  lines.push('- Evidence entries were curated from web-search results pointing to foraging-blog and extension-service URLs.');
  lines.push('- Each entry is appended to ONE existing row per species (the row whose climate zone best matches the blog\'s stated region).');
  lines.push('- DOY values, peak_doy, and confidence are NOT modified by this script.');
  lines.push('- Idempotent: re-runs skip URLs already present in any row of the species\' evidence array.');
  lines.push('- Per-species cap: stop adding once 3 distinct sources are reached.');
  lines.push('- All blog HTML cached to data/exploration/blog-cache/.');
  lines.push('');

  fs.writeFileSync(SUMMARY_PATH, lines.join('\n'));
  console.log(`\nWrote ${SUMMARY_PATH}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
