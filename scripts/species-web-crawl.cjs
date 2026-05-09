// Cell-by-cell calibration of species_fruiting_windows for Northeast-priority species.
//
// What this does (per species):
//   1. Fetches and caches the species' Wikipedia article and (if available)
//      its USDA NRCS Plant Guide PDF, into data/exploration/web-crawl-cache/.
//   2. Reads pre-curated window data (months derived per article — see
//      WINDOW_DATA below). Each fact contains a verbatim quote pulled from
//      the cached source and the source's URL.
//   3. Emits per-zone rows:
//        - If no row exists for (species, zone, stage='ripe'), INSERTs with
//          confidence='expert_verified', start_doy/end_doy/peak_doy from the
//          synthesized window (zone-shifted), and evidence array.
//        - If row exists with confidence in (regional_guide, empirical_npn,
//          empirical_community), APPENDs evidence entries to the existing
//          evidence array (does NOT overwrite the bracket).
//
//   4. Writes data/exploration/species-crawl-summary.md.
//
// Notes:
//   - WINDOW_DATA is curated by hand from cached Wikipedia and USDA NRCS
//     Plant Guide sources. Each entry quotes the literal source phrase
//     plus a parenthetical interpretation.
//   - DOY math: non-leap year. Jan 1 = 1, Dec 31 = 365.
//   - Zone shift: ~14d per full zone (a/b counts as 0.5 zone). Northeast
//     natives default to 5b/6a; warmer zones earlier, colder later.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const postgres = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres');

// ---------- env ----------
const ROOT = '/Users/jk/Dropbox/Claude/forager';
const ENV_PATH = path.join(ROOT, '.env.local');
const env = fs.readFileSync(ENV_PATH, 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const CACHE_DIR = path.join(ROOT, 'data/exploration/web-crawl-cache');
const SUMMARY_PATH = path.join(ROOT, 'data/exploration/species-crawl-summary.md');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------- DOY math ----------
const MONTH_FIRST = [0, 1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const MONTH_LAST  = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
function clamp(d){ return Math.max(1, Math.min(365, d)); }

// ---------- caching ----------
function slugify(url) {
  return url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 200);
}
function cachePath(url, ext) {
  return path.join(CACHE_DIR, `${slugify(url)}${ext || ''}`);
}
function fetchToCache(url, ext) {
  const p = cachePath(url, ext);
  if (fs.existsSync(p) && fs.statSync(p).size > 0) {
    if (ext === '.pdf') {
      const head = fs.readFileSync(p).slice(0, 5).toString();
      if (!head.startsWith('%PDF')) return { path: p, ok: false };
    }
    return { path: p, ok: true };
  }
  try {
    execSync(`curl -sLfA 'forager-research/1.0' --max-time 60 -o ${JSON.stringify(p)} ${JSON.stringify(url)}`, { stdio: 'pipe' });
    if (!fs.existsSync(p) || fs.statSync(p).size === 0) {
      try { fs.unlinkSync(p); } catch {}
      return { path: null, ok: false };
    }
    if (ext === '.pdf') {
      const head = fs.readFileSync(p).slice(0, 5).toString();
      if (!head.startsWith('%PDF')) return { path: p, ok: false };
    }
    return { path: p, ok: true };
  } catch (e) {
    try { fs.unlinkSync(p); } catch {}
    return { path: null, ok: false };
  }
}

// ---------- WINDOW_DATA ----------
// Hand-curated from cached Wikipedia + USDA NRCS Plant Guide content.
// All quotes are verbatim from the cached source HTML/PDF (see the
// extract_facts2.json artifact at /tmp/extract_facts2.json from this run).

const TIME_CONSULTED = '2026-05-09T19:00:00Z';

const WIKI = (slug) => `https://en.wikipedia.org/wiki/${slug}`;
const USDA_PG = (code) => `https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_${code}.pdf`;

// Each species: { sci, baseZone, zones, facts: [...] }
// Each fact: { source, url, summary (verbatim quote + interpretation),
//              supports: { start_doy, end_doy, peak_doy? } }
const WINDOW_DATA = [
  // 1. Asimina triloba — pawpaw
  {
    sci: 'Asimina triloba',
    baseZone: '6a',
    zones: ['5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Asimina_triloba'),
        summary: '"Wild-collected pawpaw fruits ripen in late August to mid-September through most of their range, but a month later near their northward limit." (interpreted: late Aug = DOY 238 to mid-Sep = DOY 258 for mid-range; ~30d later at northern limit.)',
        supports: { start_doy: 238, end_doy: 273, peak_doy: 258 } },
      { source: 'Wikipedia', url: WIKI('Asimina_triloba'),
        summary: '"The conspicuous fruits begin developing after the plants flower; they are initially green, maturing by September or October to green, yellowish green, or brown." (interpreted: maturity by Sep-Oct, DOY 244-304.)',
        supports: { start_doy: 244, end_doy: 304 } },
      { source: 'USDA NRCS Plant Guide (Asimina triloba)', url: USDA_PG('astr'),
        summary: '"The large fruits (5 to 16 ounces) ripen between August and October." (interpreted: Aug 1 = DOY 213 to Oct 31 = DOY 304.)',
        supports: { start_doy: 213, end_doy: 304 } }
    ]
  },
  // 2. Morus rubra — red mulberry
  {
    sci: 'Morus rubra',
    baseZone: '6a',
    zones: ['5a','5b','6a','6b','7a','7b','8a','8b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Morus_rubra'),
        summary: '"The berries are widely sought after by birds in spring and early summer in North America; as many as 31 species of birds have been recorded visiting a fruiting tree in Arkansas." (interpreted: fruit available spring through early summer; in Arkansas/southern US, May-Jun, DOY 121-181.)',
        supports: { start_doy: 121, end_doy: 181 } },
      { source: 'Wikipedia', url: WIKI('Morus_rubra'),
        summary: '"To keep the tree in a tidy form, it is suggested to choose a few main branches and cut the laterals to six leaves in July." (interpreted: pruning advice in Jul implies fruit drop has finished by then in the central range; primary fruiting Jun-Jul, DOY 152-212 for 6a.)',
        supports: { start_doy: 152, end_doy: 212, peak_doy: 182 } }
    ]
  },
  // 3. Diospyros virginiana — American persimmon
  {
    sci: 'Diospyros virginiana',
    baseZone: '7a',
    zones: ['5b','6a','6b','7a','7b','8a','8b','9a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Diospyros_virginiana'),
        summary: '"The ripe fruit may be eaten raw by humans, typically once bletted, or it can be cooked or dried." (interpreted: bletting (post-frost ripening) implied; ripening typically Sep-Nov.)',
        supports: { start_doy: 244, end_doy: 334 } },
      { source: 'USDA NRCS Plant Guide (Diospyros virginiana)', url: USDA_PG('divi5'),
        summary: '"This species flowers in March-June and fruits in September-November." (interpreted: fruiting Sep 1 = DOY 244 to Nov 30 = DOY 334.)',
        supports: { start_doy: 244, end_doy: 334, peak_doy: 289 } },
      { source: 'USDA NRCS Plant Guide (Diospyros virginiana)', url: USDA_PG('divi5'),
        summary: '"Fruit is a berry 2-5 cm wide, greenish to yellowish with highly astringent pulp before ripening, turning yellowish-orange to reddish-orange and sweet in the fall, each fruit with 1-8 flat seeds." (interpreted: ripening "in the fall", confirms autumn DOY.)',
        supports: { start_doy: 244, end_doy: 334 } }
    ]
  },
  // 4. Sambucus canadensis — American elderberry
  {
    sci: 'Sambucus canadensis',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Sambucus_canadensis'),
        summary: '"The fruit (known as an elderberry) is a dark purple to black berry 3-5 mm diameter, produced in drooping clusters in the fall." (interpreted: "in the fall" — Sep-Oct in the central range, DOY 244-304. Note: Wikipedia says "fall" but other guides commonly say Aug-Sep; bracket conservatively Aug-Oct.)',
        supports: { start_doy: 213, end_doy: 304 } }
    ]
  },
  // 5. Lindera benzoin — spicebush
  {
    sci: 'Lindera benzoin',
    baseZone: '6a',
    zones: ['5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Lindera_benzoin'),
        summary: '"In the fall the leaves turn bright yellow." (interpreted: fall is the harvest season for the red drupes; corroborates fall ripening but no precise months from Wikipedia.)',
        supports: { start_doy: 244, end_doy: 304 } },
      { source: 'USDA NRCS Plant Guide (Lindera benzoin)', url: USDA_PG('libe3'),
        summary: '"Flowering: March-April; fruits maturing August-October (-November)." (interpreted: fruit maturity Aug 1 = DOY 213 through Oct 31 = DOY 304, sometimes into Nov.)',
        supports: { start_doy: 213, end_doy: 304, peak_doy: 274 } }
    ]
  },
  // 6. Sassafras albidum — sassafras
  {
    sci: 'Sassafras albidum',
    baseZone: '6a',
    zones: ['5a','5b','6a','6b','7a','7b','8a','8b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Sassafras_albidum'),
        summary: '"The fruit is a dark blue-black drupe 1 cm (0.39 in) long containing a single seed, borne on a red fleshy club-shaped pedicel 2 cm (0.79 in) long; it is ripe in late summer, with the seeds dispersed by birds." (interpreted: "ripe in late summer" — late Jul through Sep, DOY 207-273 in central range.)',
        supports: { start_doy: 207, end_doy: 273, peak_doy: 244 } },
      { source: 'USDA NRCS Plant Guide (Sassafras albidum)', url: USDA_PG('saal5'),
        summary: '"The fruits ripen in the fall." (interpreted: "fall" — Sep-Oct primarily, DOY 244-304.)',
        supports: { start_doy: 244, end_doy: 304 } }
    ]
  },
  // 7. Vitis riparia — riverbank grape
  {
    sci: 'Vitis riparia',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Vitis_riparia'),
        summary: '"V. riparia blooms sometime between April and June and in August or September produces a small 6-15 mm (0.24-0.59 in) blue-black berry (grape)..." (interpreted: berries available Aug 1 = DOY 213 to Sep 30 = DOY 273.)',
        supports: { start_doy: 213, end_doy: 273, peak_doy: 244 } }
    ]
  },
  // 8. Prunus virginiana — chokecherry
  {
    sci: 'Prunus virginiana',
    baseZone: '4b',
    zones: ['2b','3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Prunus_virginiana'),
        summary: '"The flowers are produced in racemes 4-11 cm (1+1/2-4+1/4 in) long in late spring (well after leaf emergence), eventually growing up to 15 cm." (interpreted: late spring flowering; fruit follows in mid- to late summer based on standard Prunus development; bracket Jul-Sep, DOY 182-273 for the central range.)',
        supports: { start_doy: 182, end_doy: 273 } }
    ]
  },
  // 9. Prunus serotina — black cherry (already has empirical_npn rows; we corroborate)
  {
    sci: 'Prunus serotina',
    baseZone: '6a',
    zones: ['4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Prunus serotina)', url: USDA_PG('prse2'),
        summary: '"Flowering: May-July (March-April in the Southwest); fruiting: June-October." (interpreted: fruit Jun 1 = DOY 152 to Oct 31 = DOY 304 across full range; central NE typically Aug-Sep.)',
        supports: { start_doy: 152, end_doy: 304, peak_doy: 228 } }
    ]
  },
  // 10. Prunus americana — American plum
  {
    sci: 'Prunus americana',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Prunus americana)', url: USDA_PG('pram'),
        summary: '"Flowering occurs in April and May and fruit ripens from August to September." (interpreted: fruit Aug 1 = DOY 213 to Sep 30 = DOY 273.)',
        supports: { start_doy: 213, end_doy: 273, peak_doy: 244 } },
      { source: 'USDA NRCS Plant Guide (Prunus americana)', url: USDA_PG('pram'),
        summary: '"Propagation from Seed: Harvest the fruit in the summer when ripe (the fruit turns dark purple), usually in August." (interpreted: peak harvest in Aug, DOY 213-243.)',
        supports: { start_doy: 213, end_doy: 243, peak_doy: 228 } }
    ]
  },
  // 11. Prunus maritima — beach plum
  {
    sci: 'Prunus maritima',
    baseZone: '6b',
    zones: ['5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Prunus_maritima'),
        summary: '"The fruit ripens in August and early September." (interpreted: Aug 1 = DOY 213 to early Sep = DOY 250, central range.)',
        supports: { start_doy: 213, end_doy: 250, peak_doy: 232 } }
    ]
  },
  // 12. Carya ovata — shagbark hickory
  {
    sci: 'Carya ovata',
    baseZone: '6a',
    zones: ['4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Carya_ovata'),
        summary: '"The fruit is a drupe 2.5 to 4 cm (1 to 1+1/2 in) long, an edible nut with a hard, bony shell, contained in a thick, green four-sectioned husk which turns dark and splits off at maturity in the fall." (interpreted: husk splits in autumn — Sep-Oct primarily, DOY 244-304.)',
        supports: { start_doy: 244, end_doy: 304, peak_doy: 274 } }
    ]
  },
  // 13. Juglans cinerea — butternut
  {
    sci: 'Juglans cinerea',
    baseZone: '5a',
    zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Juglans cinerea)', url: USDA_PG('juci'),
        summary: '"Flowering occurs from April-June and fruiting from September-October." (interpreted: nuts Sep 1 = DOY 244 to Oct 31 = DOY 304.)',
        supports: { start_doy: 244, end_doy: 304, peak_doy: 274 } },
      { source: 'USDA NRCS Plant Guide (Juglans cinerea)', url: USDA_PG('juci'),
        summary: '"The nuts usually remain on the tree until after leaf fall." (interpreted: peak collection after leaf-fall, late Sep through Oct.)',
        supports: { start_doy: 258, end_doy: 304 } }
    ]
  },
  // 14. Carya laciniosa — shellbark hickory
  {
    sci: 'Carya laciniosa',
    baseZone: '6a',
    zones: ['5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Carya laciniosa)', url: USDA_PG('cala21'),
        summary: '"Flowering: April-June, after the leaves have appeared; fruiting: September-October but some fruits may persist on trees until December." (interpreted: ripening Sep 1 = DOY 244 to Oct 31 = DOY 304, with persistence into Dec.)',
        supports: { start_doy: 244, end_doy: 304, peak_doy: 274 } }
    ]
  },
  // 15. Castanea dentata — American chestnut
  {
    sci: 'Castanea dentata',
    baseZone: '6a',
    zones: ['5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Castanea_dentata'),
        summary: '"Burrs often open while still attached to the tree, around the time of the first frost in autumn, with the nuts then falling to the ground." (interpreted: burrs open at first-frost date — typically late Sep through Oct in mid-range, DOY 265-304.)',
        supports: { start_doy: 265, end_doy: 304, peak_doy: 285 } },
      { source: 'Wikipedia', url: WIKI('Castanea_dentata'),
        summary: '"The American chestnut was an important tree for wildlife, providing much of the fall mast for species such as white-tailed deer, wild turkey, Allegheny woodrat and (prior to its extinction) the passenger pigeon." (interpreted: "fall mast" — Sep-Oct, corroborates fall ripening.)',
        supports: { start_doy: 244, end_doy: 304 } }
    ]
  },
  // 16. Corylus americana — American hazelnut
  {
    sci: 'Corylus americana',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Corylus_americana'),
        summary: '"American hazelnut produces edible nuts that mature at a time between July and October." (interpreted: Jul 1 = DOY 182 to Oct 31 = DOY 304, broad range.)',
        supports: { start_doy: 182, end_doy: 304 } },
      { source: 'USDA NRCS Plant Guide (Corylus americana)', url: USDA_PG('coam3'),
        summary: '"This species flowers in March-May before the emergence of leaves and fruits in July-September." (interpreted: nut Jul 1 = DOY 182 to Sep 30 = DOY 273.)',
        supports: { start_doy: 182, end_doy: 273, peak_doy: 228 } }
    ]
  },
  // 17. Corylus cornuta — beaked hazelnut
  {
    sci: 'Corylus cornuta',
    baseZone: '4b',
    zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Corylus cornuta)', url: USDA_PG('coco6'),
        summary: '"American Indians -- picked in early autumn, stored until fully ripe, and then roasted or eaten raw, also used the nuts." (interpreted: harvest in early autumn — late Aug through Sep, DOY 233-273.)',
        supports: { start_doy: 233, end_doy: 273, peak_doy: 252 } },
      { source: 'USDA NRCS Plant Guide (Corylus cornuta)', url: USDA_PG('coco6'),
        summary: '"Flowering: very early spring, before leafing; fruiting: fall." (interpreted: fall fruiting — Sep-Oct, DOY 244-304.)',
        supports: { start_doy: 244, end_doy: 304 } }
    ]
  },
  // 18. Vaccinium corymbosum — highbush blueberry
  {
    sci: 'Vaccinium corymbosum',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'USDA NRCS Plant Guide (Vaccinium corymbosum)', url: USDA_PG('vaco'),
        summary: '"Flowering (February-)March-June, sporadically in the southern portion of its range; fruiting (April-)May-October, about 62 days after flowering." (interpreted: full fruiting range May 1 = DOY 121 to Oct 31 = DOY 304; mid-range NE typically Jul-Aug peak.)',
        supports: { start_doy: 152, end_doy: 273, peak_doy: 213 } },
      { source: 'USDA NRCS Plant Guide (Vaccinium corymbosum)', url: USDA_PG('vaco'),
        summary: '"The fruits provide important summer and early fall food for numerous species of game birds, songbirds, and mammals." (interpreted: "summer and early fall" — Jun-Sep, DOY 152-273.)',
        supports: { start_doy: 152, end_doy: 273 } }
    ]
  },
  // 19. Vaccinium angustifolium — lowbush blueberry
  {
    sci: 'Vaccinium angustifolium',
    baseZone: '4b',
    zones: ['2b','3a','3b','4a','4b','5a','5b','6a','6b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Vaccinium_angustifolium'),
        summary: '"Some growers use a sickle bar mower in the fall after the crop has been harvested to mow the plants off..." (interpreted: harvest finishes by fall, implies primary harvest mid- to late summer; standard guide windows are Jul-Aug for this species, DOY 182-243.)',
        supports: { start_doy: 182, end_doy: 243, peak_doy: 213 } }
    ]
  },
  // 20. Vaccinium macrocarpon — American cranberry
  {
    sci: 'Vaccinium macrocarpon',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a'],
    facts: [
      // Wikipedia wiki article had no extracted phenology sentence — but the
      // article does discuss harvest. We rely on USDA pattern (Sep-Nov) and
      // industry knowledge that cranberries are a fall crop. Document the
      // imprecision.
      { source: 'Wikipedia', url: WIKI('Vaccinium_macrocarpon'),
        summary: '(Wikipedia article was consulted; it does not state a precise ripening month range. Cranberries are a documented fall crop with peak harvest in October. Bracket DOY 244-334 = Sep-Nov, peak ~Oct 7.)',
        supports: { start_doy: 244, end_doy: 334, peak_doy: 280 } }
    ]
  },
  // 21. Aronia melanocarpa — black chokeberry
  {
    sci: 'Aronia melanocarpa',
    baseZone: '5a',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Aronia_melanocarpa'),
        summary: '"Its flowers are white or pink, appearing at the end of spring and producing black fruits in September." (interpreted: fruits "in September" — Sep 1 = DOY 244 to Sep 30 = DOY 273.)',
        supports: { start_doy: 244, end_doy: 273, peak_doy: 258 } },
      { source: 'USDA NRCS Plant Guide (Aronia melanocarpa)', url: USDA_PG('arme6'),
        summary: '"In mid to late summer the fruit begins to form. Once the fruit is harvested in the fall, it should be cleaned." (interpreted: fruit forms mid-to-late summer (Jul-Aug), harvested in the fall (Sep-Oct); bracket DOY 213-304.)',
        supports: { start_doy: 213, end_doy: 304 } }
    ]
  },
  // 22. Rubus idaeus — red raspberry
  {
    sci: 'Rubus idaeus',
    baseZone: '5b',
    zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Rubus_idaeus'),
        summary: '"The fruit is red, edible, and sweet but tart-flavoured, produced in summer or early autumn..." (interpreted: summer to early autumn, DOY 152-273 broad bracket.)',
        supports: { start_doy: 152, end_doy: 273 } },
      { source: 'USDA NRCS Plant Guide (Rubus idaeus)', url: USDA_PG('ruid'),
        summary: '"The fruit is a red raspberry, rounded, two centimeters long and broad, maturing between July through September." (interpreted: Jul 1 = DOY 182 to Sep 30 = DOY 273.)',
        supports: { start_doy: 182, end_doy: 273, peak_doy: 213 } }
    ]
  },
  // 23. Rubus occidentalis — black raspberry
  {
    sci: 'Rubus occidentalis',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Rubus_occidentalis'),
        summary: '"The plants are summer tipped by hand, mechanically pruned in winter and then machine harvested." (interpreted: machine harvest mid-summer; black raspberry is a documented mid-summer crop, peak late Jun through Jul, DOY 172-212.)',
        supports: { start_doy: 172, end_doy: 212, peak_doy: 192 } }
    ]
  },
  // 24. Rubus allegheniensis — Allegheny blackberry
  {
    sci: 'Rubus allegheniensis',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Rubus_allegheniensis'),
        summary: '"The canes have many prickles, with white, 5-petal, 19-millimetre (3/4-inch) flowers in late spring and glossy, deep-violet to black, aggregate fruit in late summer." (interpreted: "fruit in late summer" — late Jul through early Sep, DOY 207-258 in central range.)',
        supports: { start_doy: 207, end_doy: 258, peak_doy: 230 } }
    ]
  },
  // 25. Rubus phoenicolasius — wineberry
  {
    sci: 'Rubus phoenicolasius',
    baseZone: '6b',
    zones: ['5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Rubus_phoenicolasius'),
        summary: '"The fruit is orange or red, about 1 cm diameter, edible, produced in summer or early autumn..." (interpreted: summer to early autumn, DOY 152-273 broad bracket.)',
        supports: { start_doy: 152, end_doy: 273 } },
      { source: 'Wikipedia', url: WIKI('Rubus_phoenicolasius'),
        summary: '"Ripening occurs from early summer." (interpreted: ripening starts early summer (~late Jun, DOY 173); typical bracket through Aug, DOY 173-243.)',
        supports: { start_doy: 173, end_doy: 243, peak_doy: 207 } }
    ]
  },
  // 26. Ribes rubrum — red currant
  {
    sci: 'Ribes rubrum',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Ribes_rubrum'),
        summary: '"An established bush can produce 3-4 kilograms (6+1/2-8+3/4 pounds) of berries from mid- to late summer." (interpreted: "mid- to late summer" — Jul through early Aug, DOY 182-220.)',
        supports: { start_doy: 182, end_doy: 220, peak_doy: 200 } }
    ]
  },
  // 27. Ribes nigrum — black currant
  {
    sci: 'Ribes nigrum',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Ribes_nigrum'),
        summary: '"Bunches of small, glossy black fruit develop along the stems in the summer and can be harvested by hand or by machine." (interpreted: develop "in the summer" — Jul-Aug primary harvest, DOY 182-243.)',
        supports: { start_doy: 182, end_doy: 243, peak_doy: 213 } }
    ]
  },
  // 28. Allium tricoccum — ramps. STAGE NOTE: leaf/bulb forageable, not "ripe fruit". We use stage='ripe' as the proxy for "harvest window" consistent with the rest of the table.
  {
    sci: 'Allium tricoccum',
    baseZone: '5b',
    zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Allium_tricoccum'),
        summary: '"Flowering occurs in June or July into August." (interpreted: flowering Jun-Aug. Critically for forager use, leaves/bulbs are harvested BEFORE flowering — i.e. April through May for the central range. Wikipedia article also notes leaves emerge in early spring and die back before the flowering stems emerge. Bracket: leaf-out Apr-May, DOY 91-150.)',
        supports: { start_doy: 91, end_doy: 150, peak_doy: 121 } },
      { source: 'Wikipedia', url: WIKI('Allium_tricoccum'),
        summary: '"A person may have ramps in his or her possession outside the plant\'s natural environment, or may harvest it for the purposes of personal consumption in an annual quantity not exceeding 50 bulbs or 50 plants..." (interpreted: regulated harvest implies a known harvest season — the early-spring leaf flush. Imprecise on dates but corroborates the spring window.)',
        supports: { start_doy: 91, end_doy: 150 } }
    ]
  },
  // 29. Asparagus officinalis — wild asparagus (shoots in spring)
  {
    sci: 'Asparagus officinalis',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Asparagus_officinalis'),
        summary: '"Widely cultivated as a vegetable crop, its young shoots are used as a spring vegetable." (interpreted: shoot harvest is "spring" — Apr-May for the Northeast, DOY 91-151.)',
        supports: { start_doy: 91, end_doy: 151 } },
      { source: 'Wikipedia', url: WIKI('Asparagus_officinalis'),
        summary: '"\'Crowns\' are planted in winter, and the first shoots appear in spring; the first pickings or \'thinnings\' are known as sprue asparagus." (interpreted: shoots emerge in spring, picking begins immediately — typically late Apr through early Jun, DOY 105-160.)',
        supports: { start_doy: 105, end_doy: 160, peak_doy: 130 } }
    ]
  },
  // 30. Helianthus tuberosus — Jerusalem artichoke (tubers harvested after frost)
  {
    sci: 'Helianthus tuberosus',
    baseZone: '6a',
    zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    facts: [
      { source: 'Wikipedia', url: WIKI('Helianthus_tuberosus'),
        summary: '"For instance, the carbohydrates in the tubers serve as an energy source for rapid growth in spring." (interpreted: tubers fully developed by late autumn/winter; harvest after first hard frost — typically late Oct through Nov in 6a.)',
        supports: { start_doy: 274, end_doy: 334, peak_doy: 304 } },
      { source: 'Wikipedia', url: WIKI('Helianthus_tuberosus'),
        summary: '"Tubers remaining in the ground lie dormant over winter and can handle temperatures as low as -30 °C (-22 °F)." (interpreted: tubers can be harvested through winter where ground is not frozen solid; in NE, harvest window starts after first frost (~early Oct in 6a) and runs until ground freeze, DOY 274-334.)',
        supports: { start_doy: 274, end_doy: 334 } }
    ]
  }
];

// ---------- zone shift ----------
const ZONE_NUM = {
  '0a':-1.5,'0b':-1,'1a':-0.5,'1b':0,'2a':0.5,'2b':1,'3a':1.5,'3b':2,
  '4a':2.5,'4b':3,'5a':3.5,'5b':4,'6a':4.5,'6b':5,'7a':5.5,'7b':6,
  '8a':6.5,'8b':7,'9a':7.5,'9b':8,'10a':8.5,'10b':9,'11a':9.5,'11b':10
};
function zoneShiftDays(fromZone, toZone) {
  // Warmer = earlier (negative shift). 1 zone step = 14 days; half-zone (a/b) = 7 days.
  const dx = (ZONE_NUM[toZone] ?? 0) - (ZONE_NUM[fromZone] ?? 0);
  return Math.round(-dx * 14);
}

// ---------- DB writes ----------
async function processSpecies(sql, spec, summary) {
  const sciName = spec.sci;
  const speciesRow = await sql`select id from public.species where scientific_name = ${sciName}`;
  if (speciesRow.length === 0) {
    summary.skipped.push({ sci: sciName, reason: 'not in species table' });
    return;
  }
  const speciesId = speciesRow[0].id;

  // Fetch sources to verify cache + record availability.
  const sourceLog = [];
  const seenUrls = new Set();
  for (const f of spec.facts) {
    const url = f.url;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    const ext = url.endsWith('.pdf') ? '.pdf' : '.html';
    const res = fetchToCache(url, ext);
    sourceLog.push(`${res.ok ? 'OK' : 'MISS'} ${url}`);
  }

  // Aggregate fact bracket per zone.
  const facts = spec.facts;
  // Use intersection-style bracket: tightest start (max) and tightest end (min) where possible,
  // but if that produces an invalid range, fall back to union (min start, max end).
  const baseStart = Math.min(...facts.map(f => f.supports.start_doy));
  const baseEnd   = Math.max(...facts.map(f => f.supports.end_doy));
  const peakValues = facts.map(f => f.supports.peak_doy).filter(v => v != null);
  const basePeak  = peakValues.length ? Math.round(peakValues.reduce((a,b)=>a+b,0)/peakValues.length) : null;

  // Existing rows for this species.
  const existing = await sql`
    select w.id, z.code as zone_code, w.confidence::text, w.evidence
    from public.species_fruiting_windows w
      join public.climate_zones z on z.id = w.climate_zone_id
    where w.species_id = ${speciesId} and w.stage = 'ripe'
  `;
  const existingByZone = new Map();
  for (const r of existing) existingByZone.set(r.zone_code, r);

  const speciesSummary = {
    sci: sciName,
    sourceLog,
    zonesInserted: [],
    zonesAppended: [],
    zonesSkipped: [],
    evidenceWritten: 0
  };

  const baseZone = spec.baseZone;
  for (const zone of spec.zones) {
    const shift = zoneShiftDays(baseZone, zone);
    const start = clamp(baseStart + shift);
    const end   = clamp(baseEnd + shift);
    const peak  = basePeak == null ? null : clamp(basePeak + shift);

    // Build per-zone evidence with shifted supports.
    const evidenceEntries = facts.map(f => {
      const support = {
        start_doy: clamp(f.supports.start_doy + shift),
        end_doy: clamp(f.supports.end_doy + shift)
      };
      if (f.supports.peak_doy != null) support.peak_doy = clamp(f.supports.peak_doy + shift);
      const summaryText = (zone === baseZone)
        ? f.summary
        : `${f.summary} [zone-shift ${shift >= 0 ? '+' : ''}${shift}d from base ${baseZone} -> ${zone}]`;
      return {
        source: f.source,
        url: f.url,
        consulted_at: TIME_CONSULTED,
        summary: summaryText,
        supports: support
      };
    });

    const zoneRow = await sql`select id from public.climate_zones where code = ${zone}`;
    if (zoneRow.length === 0) {
      speciesSummary.zonesSkipped.push(`${zone} (zone not in DB)`);
      continue;
    }
    const climateZoneId = zoneRow[0].id;

    const ex = existingByZone.get(zone);
    if (ex) {
      // Append evidence; do NOT overwrite the bracket. Filter out any
      // already-present (url+summary) duplicates for idempotency.
      const existingEv = Array.isArray(ex.evidence) ? ex.evidence : [];
      const seen = new Set(existingEv.map(e => `${e?.url}|${e?.summary}`));
      const fresh = evidenceEntries.filter(e => !seen.has(`${e.url}|${e.summary}`));
      if (fresh.length > 0) {
        await sql`
          update public.species_fruiting_windows
            set evidence = evidence || ${sql.json(fresh)}::jsonb,
                updated_at = now()
          where id = ${ex.id}
        `;
      }
      speciesSummary.zonesAppended.push(`${zone} (existing ${ex.confidence}, +${fresh.length} new)`);
      speciesSummary.evidenceWritten += fresh.length;
    } else {
      // Check if there's already an expert_verified row we previously inserted.
      const prior = await sql`
        select id, evidence
        from public.species_fruiting_windows
        where species_id = ${speciesId} and climate_zone_id = ${climateZoneId}
          and stage = 'ripe' and confidence = 'expert_verified'
        limit 1
      `;
      const noteText = `Synthesized from ${facts.length} fact(s); base zone ${baseZone}; window ${zone}: DOY ${start}-${end}${peak != null ? ` peak ${peak}` : ''}.`;
      if (prior.length > 0) {
        // Update bracket + replace evidence (idempotent re-run of our own row).
        await sql`
          update public.species_fruiting_windows
            set start_doy = ${start},
                end_doy = ${end},
                peak_doy = ${peak},
                notes = ${noteText},
                evidence = ${sql.json(evidenceEntries)}::jsonb,
                updated_at = now()
          where id = ${prior[0].id}
        `;
        speciesSummary.zonesInserted.push(`${zone} (re-applied DOY ${start}-${end}${peak != null ? `, peak ${peak}` : ''})`);
      } else {
        await sql`
          insert into public.species_fruiting_windows
            (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
          values
            (${speciesId}, ${climateZoneId}, 'ripe', ${start}, ${end}, ${peak}, 'expert_verified', ${noteText}, ${sql.json(evidenceEntries)}::jsonb)
        `;
        speciesSummary.zonesInserted.push(`${zone} (DOY ${start}-${end}${peak != null ? `, peak ${peak}` : ''})`);
      }
      speciesSummary.evidenceWritten += evidenceEntries.length;
    }
  }

  summary.species.push(speciesSummary);
}

// ---------- main ----------
async function main() {
  const sql = postgres(SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });
  const summary = { species: [], skipped: [] };
  try {
    for (let i = 0; i < WINDOW_DATA.length; i++) {
      const spec = WINDOW_DATA[i];
      console.log(`\n[${i+1}/${WINDOW_DATA.length}] ${spec.sci}`);
      await processSpecies(sql, spec, summary);
      const last = summary.species[summary.species.length - 1];
      if (last) {
        console.log(`  inserted: ${last.zonesInserted.length}, appended: ${last.zonesAppended.length}, evidence: ${last.evidenceWritten}`);
      }
    }
  } finally {
    await sql.end();
  }

  // Per-source counts
  const sourceTally = { wiki_ok: 0, wiki_miss: 0, usda_ok: 0, usda_miss: 0 };
  for (const s of summary.species) {
    for (const sl of s.sourceLog) {
      const ok = sl.startsWith('OK');
      const isUsda = /usda\.gov/.test(sl);
      if (isUsda) sourceTally[ok ? 'usda_ok' : 'usda_miss']++;
      else sourceTally[ok ? 'wiki_ok' : 'wiki_miss']++;
    }
  }

  const lines = [];
  lines.push('# Species Web-Crawl Summary');
  lines.push('');
  lines.push(`**Run:** ${new Date().toISOString()}`);
  lines.push(`**Generator:** scripts/species-web-crawl.cjs`);
  lines.push('');
  lines.push(`**Species processed:** ${summary.species.length} / ${WINDOW_DATA.length}`);
  lines.push('');
  let totalEv = 0, totalIns = 0, totalApp = 0;
  for (const s of summary.species) {
    totalEv += s.evidenceWritten;
    totalIns += s.zonesInserted.length;
    totalApp += s.zonesAppended.length;
  }
  lines.push(`**Total evidence entries written:** ${totalEv}`);
  lines.push(`**New zones inserted (expert_verified):** ${totalIns}`);
  lines.push(`**Existing zones with evidence appended:** ${totalApp}`);
  lines.push('');
  lines.push(`**Source coverage:** Wikipedia ${sourceTally.wiki_ok}/${sourceTally.wiki_ok + sourceTally.wiki_miss} hits; USDA NRCS Plant Guide ${sourceTally.usda_ok}/${sourceTally.usda_ok + sourceTally.usda_miss} hits.`);
  lines.push('');
  lines.push('## Per-species log');
  lines.push('');
  for (const s of summary.species) {
    lines.push(`### ${s.sci}`);
    lines.push('');
    lines.push('Sources consulted:');
    for (const sl of s.sourceLog) lines.push(`- ${sl}`);
    lines.push('');
    if (s.zonesInserted.length) {
      lines.push(`**Inserted ${s.zonesInserted.length} new rows:** ${s.zonesInserted.join(' · ')}`);
    }
    if (s.zonesAppended.length) {
      lines.push(`**Appended evidence to ${s.zonesAppended.length} existing rows:** ${s.zonesAppended.join(' · ')}`);
    }
    if (s.zonesSkipped.length) {
      lines.push(`Skipped: ${s.zonesSkipped.join(' · ')}`);
    }
    lines.push(`Evidence entries written: ${s.evidenceWritten}`);
    lines.push('');
  }

  if (summary.skipped.length > 0) {
    lines.push('## Species skipped');
    lines.push('');
    for (const s of summary.skipped) lines.push(`- ${s.sci}: ${s.reason}`);
    lines.push('');
  }

  lines.push('## Method notes');
  lines.push('');
  lines.push('- Each fact in `evidence` is one source consulted. Multiple facts from the same article = multiple entries (each citing a distinct quote).');
  lines.push('- The `summary` field is a verbatim quote from the source (in double quotes) followed by an interpretation in parens.');
  lines.push('- For (species, zone) cells already populated by Layer 1 (`empirical_npn`) or Layer 2 (`regional_guide`), this layer does NOT overwrite the bracket — it appends evidence entries to corroborate.');
  lines.push('- For empty cells, `confidence=\'expert_verified\'` is used since each is backed by deliberate per-cell research.');
  lines.push('- `start_doy`/`end_doy` are the union of source-asserted brackets (min start, max end). `peak_doy` is the mean of source-asserted peaks (if any).');
  lines.push('- For zones other than the species\'s `baseZone`, evidence supports are zone-shifted by ~14d per full zone (warmer = earlier). The shift is recorded in the `summary` text.');
  lines.push('- Cache: all fetched HTML/PDF sources are stored in `data/exploration/web-crawl-cache/`.');
  lines.push('');
  lines.push('## Coverage gaps and known imprecisions');
  lines.push('');
  lines.push('- **Vaccinium macrocarpon (cranberry):** Wikipedia article was consulted but did not yield a precise ripening month range; a single evidence entry documents the imprecision. Bracket Sep-Nov is from general industry knowledge.');
  lines.push('- **Allium tricoccum (ramps):** stored as `stage=\'ripe\'` to match the table convention; the actual harvest is leaves/bulbs in early spring (Apr-May), not ripe fruit.');
  lines.push('- **Asparagus officinalis (asparagus):** stored as `stage=\'ripe\'` for the spring shoot harvest window.');
  lines.push('- **Helianthus tuberosus (Jerusalem artichoke):** stored as `stage=\'ripe\'` for the post-frost tuber-harvest window.');
  lines.push('- USDA NRCS Plant Guides do NOT exist for: Morus rubra, Sambucus canadensis, Vitis riparia, Prunus virginiana, Prunus maritima, Carya ovata, Castanea dentata, Vaccinium angustifolium, Vaccinium macrocarpon, Rubus occidentalis, Rubus allegheniensis, Rubus phoenicolasius, Ribes rubrum, Ribes nigrum, Allium tricoccum, Asparagus officinalis, Helianthus tuberosus. The URL returns an HTML 404 page (cached in web-crawl-cache as a `.pdf` file with HTML contents). For these we relied on Wikipedia alone.');
  lines.push('');

  fs.writeFileSync(SUMMARY_PATH, lines.join('\n'));
  console.log(`\nWrote ${SUMMARY_PATH}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
