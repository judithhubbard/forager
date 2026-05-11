// Generic species-complex unification.
//
// Many species (and species complexes) share the same per-zone harvest
// curve shape: an anchor zone with a peak DOY, a per-half-zone shift
// (heat-driven = warmer earlier; frost-driven = warmer later), and a
// half-window. This script applies that pattern as data: each entry
// in COMPLEXES specifies the curve, and the script upserts rows for
// every member species across the listed target zones.
//
// Each entry in COMPLEXES specifies:
//   - name: human-readable identifier
//   - members: list of species scientific names sharing the curve
//   - anchor_zone, anchor_peak: peak DOY at the anchor zone
//   - shift_per_half_zone: days shifted per half-zone away from anchor
//     (negative = heat-driven, warmer earlier; positive = frost-driven)
//   - half_window: days each side of peak
//   - target_zones: zones to populate (each species's plausible range)
//   - stage: stage to write (default 'ripe')
//   - source_name, source_url, summary: citation for the evidence entry
//
// Adding a new species or complex is a config edit, not a new script.
//
// Per-half-zone shifts are anchored to empirical iNat ripe-fruit slopes
// where available, with conservative rounding when n is low.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const ZONE_NUM = {
  '3a': 6, '3b': 7, '4a': 8, '4b': 9, '5a': 10, '5b': 11,
  '6a': 12, '6b': 13, '7a': 14, '7b': 15, '8a': 16, '8b': 17,
  '9a': 18, '9b': 19, '10a': 20, '10b': 21
};

const COMPLEXES = [
  // Hazelnuts — three populations with different timing:
  //   1. Wild American/Beaked (C. americana, C. cornuta) — zones 3-7 NE/midwest,
  //      drop Aug-Sep before first frost. Heat-driven across that range.
  //   2. Commercial European hazel (C. avellana) — zones 7a-9b Pacific NW + CA,
  //      maritime climate → harvest Aug-Oct, peak September. NOT heat-shift
  //      of American-hazel timing; different cultivars + cooler summers.
  //   3. Cultivated European hazel in warm zones (9a-10a CA Central Valley
  //      + So-Cal ornamentals) — similar Aug-Oct timing.
  // Earlier model heat-extrapolated American hazel into zone 8b-10a and
  // landed peaks in mid-July (DOY 198), which is ~60 days too early for
  // the ~1k hazel pins on the West Coast (Oregon is the #1 US producer).
  // Regional anchors fix the warm-zone window.
  {
    name: 'Corylus (hazelnut) complex',
    members: ['Corylus americana', 'Corylus cornuta', 'Corylus avellana', 'Corylus sp.'],
    // Reduced shift_per_half_zone -7 → -3. The earlier -7 enforced a
    // 98-day cold-to-warm spread (Oct 9 in 3a → Jul 3 in 10a) which
    // doesn't match the iNat empirical (peaks 197-220 across zones
    // 3a-8a, ~20 days of zonal spread) nor any cited source. Wild
    // American/Beaked hazelnut ripens Aug-Sep across its entire native
    // range — gradient is mild, not strongly heat-driven. PNW
    // commercial timing handled by the regional anchor below.
    anchor_zone: '6a',
    anchor_peak: 240,           // Aug 27
    shift_per_half_zone: -3,
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Corylus complex (USDA Silvics + Oregon Hazelnut Industry + UC ANR)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/corylus/americana.htm',
    summary: 'Hazelnut: wild American/Beaked drop Aug-Sep before frost in zones 3-7 (heat-driven). Commercial European hazel (C. avellana) on the Pacific Coast + CA harvests Aug-Oct (peak Sep) — maritime/cultivated timing, NOT a heat-shift of wild timing.',
    regional_anchors: [
      { zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'], source: 'USDA Silvics + Eat The Weeds', url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/corylus/americana.htm', summary: 'Wild American + Beaked hazelnut: Aug-Sep drop before first frost across the native NE/midwest/cold-PNW range. Heat-driven across this band.', peak_doy: 240, half_window: 21 },
      { zones: ['7b','8a','8b','9a','9b','10a'], source: 'Oregon Hazelnut Industry Office + UC ANR', url: 'https://www.oregonhazelnuts.org/growers/harvest', summary: 'Commercial European hazel (C. avellana): Pacific NW (Willamette Valley) + CA harvest Aug 15 - Oct 15, peak mid-Sep. Cultivars and irrigation, not wild timing.', peak_doy: 258, half_window: 30 }
    ]
  },

  // Serviceberries — Amelanchier complex hybridizes freely; foragers
  // and botanists treat them as a single juneberry/serviceberry group.
  // Empirical iNat slope -2.8 d/half-zone (n=10); rounded to -4 to
  // match Tyrant Farms (zone 7b) "late May to mid-June" citation.
  {
    name: 'Amelanchier (serviceberry) complex',
    members: ['Amelanchier arborea', 'Amelanchier canadensis', 'Amelanchier laevis', 'Amelanchier sp.'],
    // Reduced shift -4 → -3 and extended target_zones to 3a-10a so the
    // gradient stays monotonic across all zones. Previous shift -4 with
    // target_zones only 4a-8b left zone 3a-3b and 9a-10a populated by
    // iNat + PAV-smoothing, creating breaks where 4a (anchor-shifted
    // to 183) was later than 3a (iNat 176), and 8b→9a jumped from 147
    // up to 163 because PAV pooled the tail.
    anchor_zone: '6a',
    anchor_peak: 167,           // Jun 16
    shift_per_half_zone: -3,    // empirical iNat -2.8; round to -3 for cleaner gradient
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Amelanchier complex consensus',
    source_url: 'https://backyardforager.com/amelanchier-serviceberry-juneberry/',
    summary: 'Amelanchier-complex consensus: serviceberry species (arborea, canadensis, laevis, freely-hybridizing) share harvest timing. Anchor 6a peak Jun 16, heat-driven (-4d per half-zone).',
    // Per-zone-band regional citations attached as standalone evidence
    // entries so the viewer surfaces what's actually justifying the
    // projection on each zone. Each entry shifts the supports values
    // to the zone-band's representative DOY.
    regional_anchors: [
      {
        zones: ['4a','4b','5a','5b'],
        source: 'Practical Self Reliance (Vermont, zone 4)',
        url: 'https://practicalselfreliance.com/serviceberry/',
        summary: 'Practical Self Reliance (VT zone 4): "serviceberries ripen late June to early July across the northern US and southern Canada."',
        peak_doy: 184, half_window: 14
      },
      {
        zones: ['5a','5b','6a','6b','7a'],
        source: 'Backyard Forager (mid-Atlantic, zones 6-7)',
        url: 'https://backyardforager.com/amelanchier-serviceberry-juneberry/',
        summary: 'Ellen Zachos / Backyard Forager (mid-Atlantic): serviceberries ripen late June to early July; this is the canonical "Juneberry" pattern in the mid-Atlantic.',
        peak_doy: 184, half_window: 14
      },
      {
        zones: ['7a','7b','8a','8b'],
        source: 'Tyrant Farms (South Carolina, zone 7b)',
        url: 'https://www.tyrantfarms.com/forage-serviceberries-juneberries-in-the-southeast/',
        summary: 'Tyrant Farms (SC zone 7b): serviceberries ripen late May to mid-June in the southeastern US — earlier than the northern juneberry timing.',
        peak_doy: 156, half_window: 16
      }
    ]
  },

  // Mulberry complex — red, white, and black mulberry share harvest
  // timing (heat-driven, ~Jun 24 in zone 6a). Empirical iNat slope
  // -6.2 d/half-zone (n=20 across the genus).
  {
    name: 'Mulberry complex',
    members: ['Morus rubra', 'Morus alba', 'Morus nigra'],
    anchor_zone: '6a',
    anchor_peak: 170,           // Jun 19 (was 175 Jun 24; re-anchored to iNat 6a peak)
    shift_per_half_zone: -7,    // was -6; warm-zone synth was lagging iNat by 14-27d
    half_window: 18,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Mulberry complex (Cornell Cooperative Extension + Practical Self Reliance)',
    source_url: 'https://gardening.cals.cornell.edu/plants/mulberry/',
    summary: 'Mulberry complex (Morus rubra, M. alba, M. nigra): heat-driven harvest, peak in zone 6a is ~Jun 24 (DOY 175); ~6 days earlier per warmer half-zone (empirical iNat fit, n=20).'
  },

  // Pawpaw — anchored to KSU Pawpaw Program + Ohio State Extension:
  // peak in zone 6a is mid-September (~Sep 15 / DOY 258). Earlier
  // -10 shift was based on a stale iNat slope claim; per-zone iNat
  // peaks across 5b-8b cluster at 185-230 (Jul 4 - Aug 18) — a
  // gradient of ~5-6 d/half-zone, not 10. Reduced shift -10 → -5.
  // Target zones narrowed to 5a-8b — pawpaw's real native + cultivated
  // range; iNat 9a "May" peaks were almost certainly flowering, not
  // ripe fruit.
  {
    name: 'Pawpaw',
    members: ['Asimina triloba'],
    anchor_zone: '6a',
    anchor_peak: 258,           // Sep 15
    shift_per_half_zone: -5,
    half_window: 21,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Pawpaw (KSU Pawpaw Program + Ohio State Extension)',
    source_url: 'https://www.kysu.edu/academics/college-acs/school-of-aens/pawpaw/',
    summary: 'Pawpaw (Asimina triloba): heat-driven harvest, peak in zone 6a mid-September. Mild gradient (~5 d/half-zone) across native range zones 5a-8b. Fruits poorly outside this band — exclude 9a+ from the synth.'
  },

  // Allegheny chinkapin — heat-driven (NOT frost-driven; cited sources
  // describe Aug-Sep harvest with no requirement for first frost).
  // Re-anchored 2026-05-10: peak shifted Sep 29 → Sep 15 in zone 7a so
  // the cited Aug-Sep window actually matches the math (was extending
  // to Oct 20 — three weeks past the cited season). Empirical iNat
  // slope -2.6 d/half-zone; chinkapin is fairly latitude-tolerant
  // within its range. Half_window 21 → 24 to allow early-August onset.
  {
    name: 'Allegheny chinkapin',
    members: ['Castanea pumila'],
    anchor_zone: '7a',
    anchor_peak: 258,           // Sep 15
    shift_per_half_zone: -3,    // empirical iNat -2.6
    half_window: 24,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Allegheny chinkapin (Eat The Weeds + USDA Silvics + NC State Extension)',
    source_url: 'https://www.eattheweeds.com/chinkapin-edible-and-easy-to-find-2/',
    summary: 'Allegheny chinkapin (Castanea pumila): heat-driven Aug-Sep harvest across the species range. Anchor 7a peak Sep 15; iNat-empirical shallow gradient (-3 d/half-zone).'
  },

  // Fox grape — Cornell Cooperative Extension + Concord-type harvest
  // data. Peak 6a is ~Sep 9 (DOY 252). Empirical iNat slope -4.5
  // d/half-zone (n=3, low); rounded to -5 conservatively.
  {
    name: 'Fox grape',
    members: ['Vitis labrusca'],
    anchor_zone: '6a',
    anchor_peak: 252,           // Sep 9
    shift_per_half_zone: -5,    // empirical iNat -4.5 (low n=3)
    half_window: 21,
    target_zones: ['5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Fox grape (Cornell Cooperative Extension, Concord-type Vitis labrusca harvest)',
    source_url: 'https://gardening.cals.cornell.edu/plants/grape/',
    summary: 'Fox grape (Vitis labrusca, Concord-type): heat-driven, peak 6a ~Sep 9. Cornell CE Northeast harvest data; conservative -5 d/half-zone gradient.'
  },

  // Peach — heavily zone-driven cultivar range (south GA peaches in
  // May, north MI peaches in August). Empirical iNat slope -23.6
  // d/half-zone (n=5) is the steepest of any forageable species.
  // That's plausible: peach cultivars are deliberately bred for the
  // zone, so each zone effectively has a different-timing variety.
  // Anchor at zone 7b peak Jun 3 (DOY 154); -15 d/half-zone is the
  // conservative slope (raw was -23.6, but n=5 is low so trim).
  {
    name: 'Peach',
    members: ['Prunus persica'],
    anchor_zone: '7b',
    anchor_peak: 154,
    shift_per_half_zone: -15,
    half_window: 28,            // wide window: cultivar variety per zone
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'ripe',
    source_name: 'Peach (iNat-empirical heat-shift fit + commercial cultivar timing)',
    source_url: 'https://www.fruit.cornell.edu/peach/',
    summary: 'Peach (Prunus persica): heavily heat-driven, with cultivars selected per zone. Empirical iNat slope ~-24 d/half-zone (n=5); using -15 conservatively. Anchor zone 7b peak early June.'
  },

  // Wintergreen (Gaultheria procumbens) — low evergreen with persistent
  // red berries. Berries form mid-summer, ripen late summer/early fall,
  // persist through winter. Empirical iNat slope -15 d/half-zone (n=10).
  // Anchor zone 5b peak Jun 19 (DOY 170).
  {
    name: 'Wintergreen',
    members: ['Gaultheria procumbens'],
    anchor_zone: '5b',
    anchor_peak: 170,
    shift_per_half_zone: -10,   // empirical iNat -15, conservative
    half_window: 30,            // berries persist for months
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Wintergreen (iNat-empirical heat-shift fit)',
    source_url: 'https://www.inaturalist.org/taxa/47885-Gaultheria-procumbens',
    summary: 'Wintergreen (Gaultheria procumbens): forms berries mid-summer that persist through winter. Empirical iNat slope ~-15 d/half-zone (n=10); using -10 conservatively. Wide harvest window reflects persistent berries.'
  },

  // Mahonia (Oregon grape) complex — Oregon grape (M. aquifolium) and
  // creeping Oregon grape (M. repens) share harvest timing. Both have
  // had no cited regional sources before this entry. Empirical iNat
  // slope -5.2 d/half-zone (n=21). Anchor zone 6a peak DOY 215 (Aug 3).
  {
    name: 'Mahonia (Oregon grape) complex',
    members: ['Mahonia aquifolium', 'Mahonia repens'],
    anchor_zone: '6a',
    anchor_peak: 215,           // Aug 3
    shift_per_half_zone: -3,    // re-fit from per-species iNat (-2.4 to -5.2 range; -3 splits the difference)
    half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Mahonia complex (iNat-empirical heat-shift fit)',
    source_url: 'https://en.wikipedia.org/wiki/Mahonia_aquifolium',
    summary: 'Mahonia complex (M. aquifolium, M. repens): Pacific NW understory shrubs with edible blue berries. Empirical iNat slope -5 d/half-zone (n=21). Anchor zone 6a peak Aug 3.'
  },

  // Sambucus (elderberry) complex — American elderberry (S. canadensis),
  // European/black elderberry (S. nigra), and blue elderberry
  // (S. cerulea) share harvest timing. Black elderberry has only 1 zone
  // of data on its own; combining fills the gap. Empirical iNat slope
  // -4.3 d/half-zone (n=25). Anchor zone 7b peak DOY 222 (Aug 10);
  // re-anchored at 6a peak Aug 24 (DOY 236) for centrality.
  {
    name: 'Sambucus (elderberry) complex',
    members: ['Sambucus canadensis', 'Sambucus nigra', 'Sambucus cerulea'],
    anchor_zone: '6a',
    anchor_peak: 236,           // Aug 24
    shift_per_half_zone: -4,    // empirical iNat -4.3
    half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Sambucus complex (iNat-empirical heat-shift fit + cited regional sources)',
    source_url: 'https://en.wikipedia.org/wiki/Sambucus',
    summary: 'Sambucus complex (S. canadensis, S. nigra, S. cerulea): edible black/blue elderberries share late-summer ripening. Empirical iNat slope -4 d/half-zone (n=25). Anchor zone 6a peak Aug 24.'
  },

  // Sambucus elderflowers — flowers bloom ~6 weeks before berries.
  // Anchor 6a peak Jun 14 (DOY 165) per cross-source consensus:
  // PSR (VT zone 4) late-June peak → ~173 in zone 5a, fitting -4
  // d/half-zone from a 6a anchor at 165. The "mid-Jun to mid-Jul"
  // manual note was the full window, not the peak.
  {
    name: 'Sambucus (elderflower) complex',
    members: ['Sambucus canadensis', 'Sambucus nigra', 'Sambucus cerulea'],
    anchor_zone: '6a',
    anchor_peak: 165,           // Jun 14
    shift_per_half_zone: -4,
    half_window: 14,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'flower_harvest',
    source_name: 'Sambucus flowers (Backyard Forager + Practical Self Reliance + foraging consensus)',
    source_url: 'https://practicalselfreliance.com/elderflower-cordial/',
    summary: 'Sambucus elderflower complex: cream-colored flat-topped umbels for cordial / fritters / champagne. PSR (VT zone 4) cites late-June peak; BF (mid-Atlantic) cites mid-June. Anchor 6a peak Jun 14, shift -4 d/half-zone (same gradient as fruit, which follows ~6 weeks later).'
  },

  // Wild Vitis (grape) — riverbank grape (V. riparia), summer grape
  // (V. aestivalis). Same fall-ripe pattern as fox grape (V. labrusca,
  // separate entry); foragers don't distinguish. Anchor matches fox
  // grape (zone 6a peak Sep 9, DOY 252) — these are all wild Northeast
  // Vitis with similar timing.
  {
    name: 'Wild Vitis (grape) complex',
    members: ['Vitis riparia', 'Vitis aestivalis'],
    anchor_zone: '6a',
    anchor_peak: 252,           // Sep 9 (matches fox grape)
    shift_per_half_zone: -5,    // matches fox grape's -5
    half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Wild Vitis complex (Cornell CE + USDA Silvics, paralleling V. labrusca)',
    source_url: 'https://gardening.cals.cornell.edu/plants/grape/',
    summary: 'Wild Vitis complex (V. riparia, V. aestivalis): wild Northeast grape species with same fall-ripe pattern as V. labrusca. Anchor zone 6a peak Sep 9 (matches fox grape).'
  },

  // Crataegus (hawthorn) — ~200 NA species, hybridize freely, foragers
  // treat as a group. Cited timing converges on Sep-Oct ripe across the
  // hawthorn range. iNat is unreliable here (peak 194 / mid-July) —
  // captures developing fruit, not ripe. Using cited Sep 25 anchor for
  // zone 6a, conservative -3 d/half-zone gradient.
  {
    name: 'Crataegus (hawthorn) complex',
    members: ['Crataegus sp.'],
    anchor_zone: '6a',
    anchor_peak: 268,           // Sep 25
    shift_per_half_zone: -3,
    half_window: 28,            // wide: hybrid timing varies
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Crataegus complex (USDA Silvics + cited foraging guides)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/crataegus/',
    summary: 'Crataegus complex (~200 freely-hybridizing NA hawthorn species): cited Sep-Oct ripe across the genus range. Conservative -3 d/half-zone gradient; iNat is wrong-stage (captures developing fruit).'
  },

  // Fraxinus (ash) edible samaras — green ash, white ash, black ash.
  // The "ripe" stage in our schema means "harvestable" — for ash, that's
  // the brief mid-April to late-May window when samaras (winged seeds)
  // are tender and papery-soft, before the seed coat hardens. iNat for
  // Fraxinus captures persistent samaras on the tree (Aug-Oct), which
  // is the WRONG stage for foraging — that data dominates the rederive
  // synthesis and pushes the peak to ~220-240 (late summer). Override
  // with cited spring-samara timing: anchor 6a peak Apr 30 (DOY 120).
  // Heat-driven gradient -3 d/half-zone (very mild — early-spring
  // foliation tracks chill hours more than warmth). Same as the Siberian
  // elm edible-samara window (Ulmus pumila correctly already shows
  // peak ~Apr in iNat because observers tag the right stage there).
  {
    name: 'Fraxinus (ash) edible samara complex',
    members: ['Fraxinus pennsylvanica', 'Fraxinus americana', 'Fraxinus nigra'],
    anchor_zone: '6a',
    anchor_peak: 120,           // Apr 30
    shift_per_half_zone: -3,    // mild heat-driven (early-spring tender stage)
    half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Fraxinus edible samara complex (foraging guides + manual prose)',
    source_url: 'https://practicalselfreliance.com/foraging-ash-seeds/',
    summary: 'Fraxinus complex (green ash, white ash, black ash): tender edible samaras mid-April to late-May; hardens after that. iNat for these species captures persistent visible samaras (Aug-Oct) which is the wrong stage — overriding with cited spring-samara timing. Anchor 6a peak Apr 30, mild -3 d/half-zone heat shift.'
  },

  // Common plantain (Plantago major) — leaves stage. forage_parts on
  // the species record lists ['leaf','seed']; seed-head timing was
  // already covered by an iNat-derived 'ripe' stage (peak ~Sep 4),
  // but the leaves stage was missing entirely. Young tender leaves
  // are best harvested mid-Apr to early-Jun in zone 6a; tougher
  // (still edible cooked) through summer. Mild heat-driven gradient
  // (early-spring greens follow soil warming).
  {
    name: 'Common plantain (leaves)',
    members: ['Plantago major'],
    anchor_zone: '6a',
    anchor_peak: 130,           // May 10
    shift_per_half_zone: -3,
    half_window: 30,            // wide: leaves harvestable for weeks
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'leaf',
    source_name: 'Common plantain (Eat The Weeds + Practical Self Reliance + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/white-mans-little-foot-dwarf-plantain-2/',
    summary: 'Common plantain (Plantago major): broad oval rosette leaves with prominent parallel veins and elastic "strings" inside the leafstalk when torn — the field-ID giveaway. Harvest young tender leaves mid-Apr through early-Jun in 6a; older leaves get fibrous and stringy but stay edible cooked (chop fine, sauté or braise like collards). Native peoples called the European P. major "white man\'s footprint" — it followed colonial trails. Traditional uses: poultice for insect bites/stings/scrapes (crushed leaf draws and soothes), antimicrobial tea, and the famous bushcraft band-aid. Seeds (separate ripe-stage row) yield psyllium-style mucilage. No serious toxicity; avoid roadside plants (heavy metals).'
  },

  // American persimmon (Diospyros virginiana) — heat-driven late-summer
  // / early-fall fruit. Long miscategorized as frost-driven because of
  // the folk "wait for first frost" wisdom — but iNat data (N=909 in
  // zone 7a alone, ~5000 total observations across zones) clearly
  // shows ripe peak DOY ~270 in 7a (Sep 27), declining 4 days per
  // warmer half-zone. Anchor 6a peak DOY 275 (Oct 2) per empirical fit.
  // Native persimmons fall from the tree when ripe — that's the harvest
  // signal, not first-frost.
  {
    name: 'American persimmon',
    members: ['Diospyros virginiana'],
    anchor_zone: '6a',
    anchor_peak: 275,           // Oct 2
    shift_per_half_zone: -4,    // empirical iNat -4 (n=9 zones, total N≈5000)
    half_window: 28,            // wide: ripening drops scattered over weeks
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'ripe',
    source_name: 'American persimmon (iNat-empirical, N≈5000 across zones)',
    source_url: 'https://www.inaturalist.org/taxa/47885-Diospyros-virginiana',
    summary: 'American persimmon (Diospyros virginiana): heat-driven late-summer/early-fall fruit. iNat empirical data (N=909 in zone 7a alone) shows peak ~Sep 27, declining -4 d/half-zone in warmer zones. Native persimmons drop from the tree when fully ripe — the drop is the harvest cue, not first frost.'
  },

  // American cranberry (Vaccinium macrocarpon) — bog-loving plant.
  // Cited foraging guides converge on October harvest peak with a
  // Sep-Nov window: Never A Goose Chase (MN zone 4) "early-to-mid
  // October; berries persist well after a frost"; Herb Society of
  // America "September through first part of November"; Wikipedia
  // "fall crop, peak harvest in October." iNat captures the moment
  // berries first turn red (early Sept) but the actual harvest peak
  // is later when berries are fully sized and tannins have reduced.
  // Cranberry is *primarily* heat-driven (ripening accumulates GDD)
  // but folkloric "after first frost" tradition reflects flavor
  // improvement (tannin reduction), not the ripening event itself.
  {
    name: 'American cranberry',
    members: ['Vaccinium macrocarpon'],
    anchor_zone: '6a',
    anchor_peak: 280,           // Oct 7 — per cited foraging guides
    shift_per_half_zone: -3,    // mild heat-driven; bog microclimate buffers
    half_window: 35,            // wide: cited Sep-Nov window
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'American cranberry (Herb Society of America + Never A Goose Chase + Wikipedia)',
    source_url: 'https://www.herbsociety.org/file_download/inline/c2c2c8df-0ef1-43e6-a90d-b6017c3b0a32',
    summary: 'American cranberry (Vaccinium macrocarpon): cited foraging guides converge on October harvest peak (Sep through first part of November). iNat shows berries turn red in early Sept but the cited harvest peak is later when berries are fully sized. Anchor 6a peak Oct 7, mild -3 d/half-zone gradient.'
  },

  // Chokecherry (Prunus virginiana) — heat-driven, mild gradient.
  // iNat slope is +1.9 d/half-zone (slight warmer-later) but this is
  // an artifact of persistent fruit on stem in warm zones; biology is
  // mildly heat-driven. Pre-existing synth had a -7d/half-zone gradient
  // that's too steep — chokecherry doesn't ripen 60+ days earlier in
  // warm zones. Anchor 6a peak Aug 1 (DOY 213), shift -2.
  {
    name: 'Chokecherry',
    members: ['Prunus virginiana'],
    anchor_zone: '6a',
    anchor_peak: 213,           // Aug 1
    shift_per_half_zone: -2,    // mild; iNat artifact +1.9 reflects persistent fruit
    half_window: 21,
    target_zones: ['2b','3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Chokecherry (Minnesota Wildflowers + USDA Silvics + iNat)',
    source_url: 'https://www.minnesotawildflowers.info/shrub/choke-cherry',
    summary: 'Chokecherry (Prunus virginiana): heat-driven mid-summer to early-fall fruit. Mild gradient (-2 d/half-zone); iNat slight warmer-later signal is from persistent fruit on stem, not biological ripening. Anchor 6a peak Aug 1.'
  },

  // Black chokeberry (Aronia melanocarpa) — heat-driven, very mild
  // gradient (iNat -1.1 d/half-zone). Cold-zone synth window currently
  // includes August (DOY 213-?) which is too early-leaning per cited
  // foraging guides — Aronia ripens late-Aug to mid-Oct depending on
  // zone, with a peak ~Sep 7 in 6a. Anchor 6a peak DOY 250, shift -2.
  {
    name: 'Black chokeberry',
    members: ['Aronia melanocarpa'],
    anchor_zone: '6a',
    anchor_peak: 250,           // Sep 7
    shift_per_half_zone: -2,    // empirical iNat -1.1, conservative
    half_window: 21,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Black chokeberry (USDA Silvics + Cornell CE + iNat)',
    source_url: 'https://www.fs.fed.us/database/feis/plants/shrub/aromel/all.html',
    summary: 'Black chokeberry (Aronia melanocarpa): heat-driven late-summer to early-fall fruit. Tight ±21d window centered on Sep 7 in zone 6a; mild -2 d/half-zone gradient.'
  },

  // Ribes (currant + gooseberry) complex — cultivated black/red currant,
  // gooseberry, and wild NA congeners (prickly gooseberry, smooth
  // gooseberry, Missouri gooseberry, American black currant, red swamp
  // currant, skunk currant). All share the same heat-driven early-
  // summer fruit pattern. Anchor 6a peak Jul 14 (DOY 195), shift -5
  // (matches mulberry / similar early-summer berries).
  {
    name: 'Ribes (currant + gooseberry) complex',
    members: [
      // Cultivated
      'Ribes nigrum', 'Ribes rubrum', 'Ribes uva-crispa', 'Ribes sp.',
      // Wild NA congeners
      'Ribes cynosbati',     // prickly gooseberry
      'Ribes hirtellum',     // smooth gooseberry
      'Ribes missouriense',  // Missouri gooseberry
      'Ribes americanum',    // American black currant
      'Ribes triste',        // red swamp currant
      'Ribes glandulosum'    // skunk currant (boreal)
    ],
    anchor_zone: '6a',
    anchor_peak: 195,           // Jul 14
    shift_per_half_zone: -5,
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Ribes complex (Cornell CE + USDA Silvics + commercial timing)',
    source_url: 'https://gardening.cals.cornell.edu/plants/currant-gooseberry/',
    summary: 'Ribes complex (cultivated currants + gooseberries + wild NA congeners): heat-driven early-summer fruit. Anchor 6a peak Jul 14, shift -5 d/half-zone matching similar early-summer berries.'
  },

  // Pyrus (pear) complex — Asian + European pear, including the
  // commonly-volunteer Pyrus pyrifolia. Heat-driven late-summer fruit.
  // Cold zones (5a-6b in Ithaca region) need cold-zone coverage —
  // current Asian pear was capped at 7a despite trees growing in 5b.
  // European pear iNat (n=4) suggests anchor ~225 (Aug 13) for 6a.
  // Take a balanced anchor 240 (Aug 28) per cited guides.
  {
    name: 'Pyrus (pear) complex',
    members: ['Pyrus communis', 'Pyrus pyrifolia', 'Pyrus calleryana'],
    anchor_zone: '6a',
    anchor_peak: 240,           // Aug 28
    shift_per_half_zone: -4,
    half_window: 28,            // wide: cultivar variation
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Pyrus complex (Cornell CE + Toronto NFFTT + Backyard Forager)',
    source_url: 'https://gardening.cals.cornell.edu/plants/pear/',
    summary: 'Pyrus complex (Asian, European, callery pears): heat-driven late-summer fruit. Anchor 6a peak Aug 28, shift -4 d/half-zone. Window widened (±28d) for cultivar variability.'
  },

  // American plum (Prunus americana) — heat-driven. Original entry
  // used a flat -1 slope based on aggregate iNat slope, but warm-zone
  // (6a-8a) iNat data clearly skews 5-21 days earlier than the synth.
  // Steepening to -3 with an earlier anchor: 6a peak Aug 3 (DOY 215),
  // half_window 25 to reflect the genuine within-zone scatter.
  {
    name: 'American plum',
    members: ['Prunus americana'],
    anchor_zone: '6a',
    anchor_peak: 215,           // Aug 3 (was Aug 11; pulled earlier per iNat 6a peak 204)
    shift_per_half_zone: -3,    // was -1; warm-zone iNat clearly earlier
    half_window: 25,            // was 18; widened to fit iNat scatter
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'American plum (Minnesota Wildflowers + USDA Silvics + iNat-empirical)',
    source_url: 'https://www.minnesotawildflowers.info/shrub/wild-plum',
    summary: 'American plum (Prunus americana): heat-driven late-summer fruit. Anchor 6a peak Aug 3, shift -3 d/half-zone — warm zones (6a-8a) ripen 5-21 days earlier per iNat. ±25d window reflects real within-zone scatter.'
  },

  // Dandelion (Taraxacum officinale) leaves — extends to all zones
  // (was previously limited to 5a-6a). Spring tender leaves preferred;
  // bitter post-flowering. Heat-driven (early-spring greens follow
  // soil warming). Anchor 6a peak Apr 17 (DOY 107), shift -3.
  {
    name: 'Dandelion (leaves)',
    members: ['Taraxacum officinale'],
    anchor_zone: '6a',
    anchor_peak: 107,           // Apr 17
    shift_per_half_zone: -3,
    half_window: 30,            // wide: leaves harvestable for weeks
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'leaf',
    source_name: 'Dandelion (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/dandelions-hear-them-roar/',
    summary: 'Dandelion (Taraxacum officinale) leaves: deeply-toothed rosette ("dent-de-lion" = lion\'s tooth), single hollow flower stalk with white latex when broken — distinguishes from look-alike cat\'s ear and hawkweed which have branched, hairy stalks. Harvest pre-bud rosette leaves mid-Apr in 6a; intensely bitter after flowering (still usable, blanch and refresh in cold water to mellow). Traditional uses span the Old World: Italian/Mediterranean wild-greens sauté with garlic and oil, French pissenlit salad with bacon, German Löwenzahnsalat, dandelion wine from the petals (yellow only — green calyx is bitter), roasted-root coffee substitute, spring blood-cleanser tonic. High in vitamins A, C, K, calcium, potassium. Diuretic (French nickname pissenlit = "wet the bed"); generally safe but avoid heavy use if on lithium or potassium-sparing diuretics.'
  },

  // ── Edible greens batch 2026-05-10 ──
  //
  // Tier-1 spring greens: tender shoots/leaves that peak early in
  // the growing season, get bitter or tough as plants bolt. Heat-driven
  // (warmer zones earlier). Wide half-windows because these are
  // edible for several weeks each.
  {
    name: 'Stinging nettle (spring shoots)',
    members: ['Urtica dioica'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'shoot',
    source_name: 'Stinging nettle (foraging consensus + NC State Extension)',
    source_url: 'https://plants.ces.ncsu.edu/plants/urtica-dioica/',
    summary: 'Stinging nettle (Urtica dioica): tender spring shoots, harvest pre-flowering (Apr-May in 6a). Cook or blanch to deactivate stinging hairs. Wear gloves to harvest.'
  },
  {
    name: 'Common chickweed',
    members: ['Stellaria media'],
    anchor_zone: '6a', anchor_peak: 100, shift_per_half_zone: -4, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'leaf',
    source_name: 'Common chickweed (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/stellaria-media-chickweed/',
    summary: 'Common chickweed (Stellaria media): cool-weather green, prolific spring + fall in NE, winter staple in warm zones (8+). Wilts in summer heat. Mild flavor — eat raw in salads.'
  },
  {
    name: 'Cleavers (spring shoots)',
    members: ['Galium aparine'],
    anchor_zone: '6a', anchor_peak: 110, shift_per_half_zone: -3, half_window: 25,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'shoot',
    source_name: 'Cleavers (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/cleavers-galium-aparine/',
    summary: 'Cleavers / goosegrass (Galium aparine): tender spring shoots before stems get sticky-prickly. Apr-May in 6a. Juiced or cooked (raw is unpleasant texture).'
  },
  {
    name: 'Garlic mustard (leaves + flowers)',
    members: ['Alliaria petiolata'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Garlic mustard (Eat The Weeds + Forager Chef)',
    source_url: 'https://www.eattheweeds.com/garlic-mustard-alliaria-petiolata/',
    summary: 'Garlic mustard (Alliaria petiolata): invasive — encouraged to forage. First-year basal rosette + 2nd-year pre-flowering leaves, late Apr - May in 6a. Tastes like horseradish + garlic; pesto, sautéed.'
  },
  {
    name: 'Common daylily (shoots + flowers)',
    members: ['Hemerocallis fulva'],
    anchor_zone: '6a', anchor_peak: 122, shift_per_half_zone: -3, half_window: 40,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'shoot',
    source_name: 'Common daylily (Eat The Weeds + Wild Food Girl)',
    source_url: 'https://www.eattheweeds.com/daylily/',
    summary: 'Common daylily (Hemerocallis fulva): young shoots Apr-May (asparagus-like); flower buds + open flowers Jun-Aug. Avoid in people prone to GI sensitivity — small fraction of harvesters react.'
  },
  {
    name: 'Field garlic',
    members: ['Allium vineale'],
    anchor_zone: '6a', anchor_peak: 90, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'leaf',
    source_name: 'Field garlic (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/foraging-wild-garlic-allium-vineale/',
    summary: 'Field garlic (Allium vineale): green leaves overwinter and emerge Feb-Mar (6a); harvest Mar-May before plants bolt. Tiny bulblets summer-fall. Pungent garlic flavor.'
  },
  {
    name: 'Garlic chives (leaves + flowers)',
    members: ['Allium tuberosum'],
    anchor_zone: '6a', anchor_peak: 180, shift_per_half_zone: -3, half_window: 70,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'leaf',
    source_name: 'Garlic chives (NC State Extension + foraging consensus)',
    source_url: 'https://plants.ces.ncsu.edu/plants/allium-tuberosum/',
    summary: 'Garlic chives (Allium tuberosum): cultivated perennial naturalized in disturbed areas. Leaves all season May-Oct, flower buds + flowers Aug-Sep — both edible.'
  },

  // Tier-2 warm-season greens: peak in summer (Jun-Sep in 6a), heat-loving.
  // Slightly earlier in warm zones but not strongly heat-driven.
  {
    name: 'Common purslane',
    members: ['Portulaca oleracea'],
    anchor_zone: '6a', anchor_peak: 200, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a','10b'],
    stage: 'leaf',
    source_name: 'Common purslane (NC State Extension + Eat The Weeds)',
    source_url: 'https://plants.ces.ncsu.edu/plants/portulaca-oleracea/',
    summary: 'Common purslane (Portulaca oleracea): heat-loving succulent, Jun-Sep peak in 6a. Highest plant-source omega-3 of any leafy green. Lemony-tangy; eat raw or stir-fried.'
  },
  {
    name: 'Lamb\'s quarters',
    members: ['Chenopodium album'],
    anchor_zone: '6a', anchor_peak: 180, shift_per_half_zone: -3, half_window: 55,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'leaf',
    source_name: 'Lamb\'s quarters (NC State Extension + Eat The Weeds)',
    source_url: 'https://plants.ces.ncsu.edu/plants/chenopodium-album/',
    summary: 'Lamb\'s quarters (Chenopodium album, wild spinach): late spring through summer, May-Sep peak in 6a. Younger leaves milder; cook like spinach. Oxalates — avoid for kidney-stone-prone.'
  },

  // Tier-3 roots / tubers: dug fall through early spring, frost-driven
  // (cold concentrates starches). Symmetric window straddling fall/winter.
  {
    name: 'Groundnut (tubers)',
    members: ['Apios americana'],
    anchor_zone: '6a', anchor_peak: 305, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'root_dig',
    source_name: 'Groundnut (USDA Silvics + Forager Chef)',
    source_url: 'https://plants.usda.gov/plant-profile/APAM',
    summary: 'Groundnut (Apios americana): native nitrogen-fixing vine, tubers along underground rhizome — string of dime-to-egg-sized "potatoes". Dig Sep through Mar, peak after first frost. Cooked, not raw (raw is bitter + may cause GI upset).'
  },
  {
    name: 'Lesser burdock (first-year root)',
    members: ['Arctium minus'],
    anchor_zone: '6a', anchor_peak: 290, shift_per_half_zone: -3, half_window: 50,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'root_dig',
    source_name: 'Lesser burdock (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/arctium-burdock-the-original-velcro-2/',
    summary: 'Lesser burdock (Arctium minus, "gobo"): dig first-year (rosette-only, no flower stalk) taproots in fall + spring. 1-3 ft long. Peel, slice, simmer. Heart-shaped basal leaves distinguish from foxglove (poisonous).'
  },
  {
    name: 'Japanese knotweed (spring shoots)',
    members: ['Reynoutria japonica'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 20,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'shoot',
    source_name: 'Japanese knotweed (Forager Chef + Eat The Weeds)',
    source_url: 'https://foragerchef.com/japanese-knotweed/',
    summary: 'Japanese knotweed (Reynoutria japonica): aggressive invasive — heavily encouraged to forage. Tender pink-mottled shoots before 8" tall, late Apr - May in 6a. Tart rhubarb-lemon flavor; pie, compote, syrup. DO NOT compost — drop shoots in trash.'
  },

  // Tier-4 spring flowers: short-lived bloom windows. Heat-driven.
  {
    name: 'Black locust (flowers)',
    members: ['Robinia pseudoacacia'],
    anchor_zone: '6a', anchor_peak: 145, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'flower_harvest',
    source_name: 'Black locust (USDA NRCS + foraging consensus)',
    source_url: 'https://plants.usda.gov/plant-profile/ROPS',
    summary: 'Black locust (Robinia pseudoacacia): fragrant white pendulous flower clusters, May-Jun in 6a. Brief 2-3 week bloom. Sweet, used in fritters, syrup, gelato. ONLY flowers edible — bark, leaves, seeds toxic.'
  },
  {
    name: 'Eastern redbud (flowers)',
    members: ['Cercis canadensis'],
    anchor_zone: '6a', anchor_peak: 110, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'flower_harvest',
    source_name: 'Eastern redbud (NC State Extension + foraging consensus)',
    source_url: 'https://plants.ces.ncsu.edu/plants/cercis-canadensis/',
    summary: 'Eastern redbud (Cercis canadensis): magenta-pink pea-shaped flowers on bare branches, Mar-May before leaves emerge. Mildly sweet-tart; eaten raw on salads, pickled, or as garnish. Young seed pods also edible.'
  },
  {
    name: 'Japanese tree lilac (flowers)',
    members: ['Syringa reticulata'],
    anchor_zone: '6a', anchor_peak: 170, shift_per_half_zone: -3, half_window: 12,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'flower_harvest',
    source_name: 'Japanese tree lilac (Missouri Botanical Garden + Forager Chef)',
    source_url: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=283065',
    summary: 'Japanese tree lilac (Syringa reticulata): large creamy-white flower panicles in Jun, ~2 weeks later than common lilac. Subtle honey-lilac flavor; for syrups, infusions, sugars.'
  },

  // ── Per-user review-batch 2026-05-10 ──

  // Adam's needle (Yucca filamentosa) — edible flowers only. Native
  // SE US, naturalized further north. Blooms mid-summer (Jun-Jul);
  // flowers are sweet, used in salads or fritters. Heat-driven mild.
  {
    name: "Adam's needle (flowers)",
    members: ['Yucca filamentosa'],
    // 90% of pins (Stiles LA-County + FL imports) sit in zone 10b — the
    // catalog was missing that zone. Extended target_zones to 11a. Native
    // SE-US range pushes bloom earlier in zones 10-11 (peak May rather
    // than Jun-Jul). Half-window also slightly widened so the
    // continuous gradient lands a sensible May date in 10b.
    anchor_zone: '6a', anchor_peak: 182, shift_per_half_zone: -3, half_window: 25,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a','10b','11a'],
    stage: 'flower_harvest',
    source_name: "Adam's needle (USDA Plant Profile + foraging guides)",
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=YUFI',
    summary: "Adam's needle (Yucca filamentosa): edible flowers, peak May in zones 10-11 (Florida/SoCal cultivation) and Jun-Jul in 5-9 (native SE-US wild range). Sweet pea-like flavor; pick individual flowers off the bloom stalk."
  },

  // Almond (Prunus dulcis) — commercial nut crop, dominant in CA (zones
  // 9-10). Hull-split / harvest Aug to mid-Sep depending on cultivar.
  // Anchor 9a peak Aug 25 (DOY 237), shift -7 (heat-driven, earlier in
  // warmest zones); narrow window since commercial harvest is well-
  // defined.
  // Almond split into two distinct cultivar populations (the single-
  // complex form with regional_anchors couldn't override the -7
  // heat-shift PAV smoothing in cold zones — 5a still landed in
  // mid-Oct rather than Sep-Oct).
  // 1. CA commercial (Nonpareil/Mission) in 8a-10b: Aug-Sep, mild shift
  //    since CA cultivars are heat-saturated and don't shift dramatically
  //    from 9a → 10a/10b (was -7 producing implausible early Aug peaks).
  // 2. Cold-hardy (Hall's Hardy, Javid's Iranian, Seaside Primorskiy) in
  //    5a-7b: Sep-Oct, slower-maturing varieties.
  {
    name: 'Almond — CA commercial',
    members: ['Prunus dulcis'],
    anchor_zone: '9b', anchor_peak: 237, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['8a','8b','9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Almond CA commercial (UC ANR + Almond Board of California)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=3364',
    summary: 'Almond (Prunus dulcis) — CA commercial cultivars in Central Valley zone 9a-10a. Hull-split Nonpareil end of Aug, Mission 40-60 d later. Within-CA timing variance is small (cultivars are heat-saturated); shift -3 reflects that.'
  },
  {
    name: 'Almond — cold-hardy',
    members: ['Prunus dulcis'],
    anchor_zone: '6a', anchor_peak: 274, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Almond cold-hardy (Philly Orchard Project + Shelterwood Forest Farm)',
    source_url: 'https://www.phillyorchards.org/2023/11/17/plant-spotlight-hardy-almonds/',
    summary: 'Almond (Prunus dulcis) — cold-hardy cultivars (Hall\'s Hardy, Javid\'s Iranian, Seaside Primorskiy) in NE/PA/Cornell zones 5-7. Sep-Oct harvest; slower-maturing varieties, NOT a heat-shifted CA timeline.'
  },

  // Cherimoya (Annona cherimola) — subtropical, cited Nov-May. The
  // framework rows do not wrap year-end, so the window is split into
  // two rows: late-year (Nov-Dec) and early-year (Jan-May). The Math.max
  // clamp on start_doy was previously losing the entire Nov-Dec half
  // of the cited window.
  {
    name: 'Cherimoya (late-year)',
    members: ['Annona cherimola'],
    anchor_zone: '10a', anchor_peak: 335, shift_per_half_zone: -2, half_window: 30,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Cherimoya late-year (UC ANR + California Rare Fruit Growers)',
    source_url: 'https://www.crfg.org/pubs/ff/cherimoya.html',
    summary: 'Cherimoya (Annona cherimola) Nov-Dec — first half of the cited Nov-May harvest window. Subtropical evergreen, coastal CA cultivation.'
  },
  {
    name: 'Cherimoya (early-year)',
    members: ['Annona cherimola'],
    anchor_zone: '10a', anchor_peak: 60, shift_per_half_zone: -2, half_window: 75,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Cherimoya early-year (UC ANR + California Rare Fruit Growers)',
    source_url: 'https://www.crfg.org/pubs/ff/cherimoya.html',
    summary: 'Cherimoya (Annona cherimola) Jan-May — second half of the cited Nov-May harvest window. Peaks late Feb / early Mar in coastal CA.'
  },

  // ── Tropical / Subtropical batch 2026-05-10 (zone 8b-11b) ──
  {
    name: 'Mango',
    members: ['Mangifera indica'],
    anchor_zone: '10b', anchor_peak: 196, shift_per_half_zone: -7, half_window: 60,
    target_zones: ['9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Mango (UF/IFAS MG216 + UC ANR home orchard)',
    source_url: 'https://ask.ifas.ufl.edu/publication/MG216',
    summary: 'Mango: peak Jun-Jul in south FL (10b), full range May-Sep; coastal CA later (Jul-Sep).',
    regional_anchors: [
      { zones: ['10b','11a','11b'], source: 'UF/IFAS MG216', url: 'https://ask.ifas.ufl.edu/publication/MG216', summary: 'South FL: May-Sep, peak Jun-Jul.', peak_doy: 196, half_window: 60 },
      { zones: ['9b','10a'], source: 'CRFG mango', url: 'https://crfg.org/homepage/library/fruitfacts/mango/', summary: 'Coastal S. CA: Jul-Sep, later than FL.', peak_doy: 227, half_window: 45 }
    ]
  },
  {
    name: 'Lychee',
    members: ['Litchi chinensis'],
    anchor_zone: '10b', anchor_peak: 166, shift_per_half_zone: -5, half_window: 28,
    target_zones: ['10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Lychee (UF/IFAS MG051)',
    source_url: 'https://ask.ifas.ufl.edu/publication/MG051',
    summary: 'Lychee: mid-May to early Jul in south FL, peak Jun. Cultivars (Brewster/Mauritius) spread ~4 weeks.',
    regional_anchors: [
      { zones: ['10b','11a','11b'], source: 'UF/IFAS MG051', url: 'https://ask.ifas.ufl.edu/publication/MG051', summary: 'South FL: mid-May to early Jul, peak Jun.', peak_doy: 166, half_window: 28 },
      { zones: ['10a'], source: 'CRFG lychee', url: 'https://crfg.org/homepage/library/fruitfacts/lychee/', summary: 'Coastal S. CA: Jun-Jul, later than FL.', peak_doy: 182, half_window: 28 }
    ]
  },
  // Common guava: bimodal in FL (main Aug-Oct + light spring Feb-Mar)
  // and coastal CA crosses year-end (Oct-Jan). Same split pattern as
  // cherimoya and cattail-rhizome: framework rows can't wrap year-end,
  // so two rows cover the main/late-year season and the early-year
  // shoulder season respectively.
  {
    name: 'Common guava (fall/winter)',
    members: ['Psidium guajava'],
    anchor_zone: '10a', anchor_peak: 290, shift_per_half_zone: -3, half_window: 75,
    target_zones: ['9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Common guava fall/winter (UF/IFAS + CRFG)',
    source_url: 'https://gardeningsolutions.ifas.ufl.edu/plants/edibles/fruits/guava/',
    summary: 'Common guava (Psidium guajava) main season: FL Aug-Oct, coastal CA Oct-Dec. Drops fruit progressively from late summer through year-end.'
  },
  {
    name: 'Common guava (early-year)',
    members: ['Psidium guajava'],
    anchor_zone: '10a', anchor_peak: 45, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Common guava early-year (UF/IFAS + CRFG)',
    source_url: 'https://crfg.org/homepage/library/fruitfacts/guava-tropical/',
    summary: 'Common guava (Psidium guajava) early-year shoulder: FL light spring crop Feb-Mar, coastal CA late-season fruit drop into Jan-Feb. Smaller than the fall main crop.'
  },
  {
    name: 'Pineapple guava',
    members: ['Acca sellowiana', 'Feijoa sellowiana'],
    // Cool-loving — positive shift (cooler zones LATER), counterintuitive
    // for a subtropical. Days-from-bloom driven, not heat-budget driven.
    anchor_zone: '9b', anchor_peak: 305, shift_per_half_zone: 4, half_window: 35,
    target_zones: ['8a','8b','9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Pineapple guava / feijoa (CRFG + NC State)',
    source_url: 'https://crfg.org/homepage/library/fruitfacts/feijoa/',
    summary: 'Feijoa: cool-loving, drop-harvest Oct-Dec. S. CA Oct-Nov, SF Bay Nov-Dec; warmer = earlier.',
    regional_anchors: [
      { zones: ['9b','10a','10b'], source: 'CRFG feijoa', url: 'https://crfg.org/homepage/library/fruitfacts/feijoa/', summary: 'S. CA: 4.5-6 mo post-bloom = Oct-Nov.', peak_doy: 305, half_window: 30 },
      { zones: ['8a','8b','9a'], source: 'CRFG feijoa', url: 'https://crfg.org/homepage/library/fruitfacts/feijoa/', summary: 'SF Bay: 5.5-7 mo post-bloom = Nov-Dec.', peak_doy: 335, half_window: 30 }
    ]
  },
  {
    name: 'Sugar apple',
    members: ['Annona squamosa'],
    anchor_zone: '10b', anchor_peak: 258, shift_per_half_zone: -5, half_window: 60,
    target_zones: ['10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Sugar apple (UF/IFAS MG330)',
    source_url: 'https://ask.ifas.ufl.edu/publication/MG330',
    summary: 'Sugar apple: Aug-Dec in south FL, peak Sep. Stragglers into midwinter if frost-free.',
    regional_anchors: [
      { zones: ['10b','11a','11b'], source: 'UF/IFAS MG330', url: 'https://ask.ifas.ufl.edu/publication/MG330', summary: 'South FL: mid-summer through fall, stragglers to midwinter.', peak_doy: 258, half_window: 60 }
    ]
  },
  {
    name: 'Date palm',
    members: ['Phoenix dactylifera'],
    anchor_zone: '9b', anchor_peak: 288, shift_per_half_zone: -5, half_window: 60,
    target_zones: ['9a','9b','10a','10b','11a'],
    stage: 'ripe',
    source_name: 'Date palm (USDA crop profile + CA Dates)',
    source_url: 'https://ipmdata.ipmcenters.org/documents/cropprofiles/CAdates.pdf',
    summary: 'Date palm: Coachella harvest Sep-Dec; Medjool earlier (Aug-Oct), Deglet Noor later (Oct-Dec).',
    regional_anchors: [
      { zones: ['9a','9b','10a'], source: 'USDA CA dates crop profile', url: 'https://ipmdata.ipmcenters.org/documents/cropprofiles/CAdates.pdf', summary: 'Coachella: ripen Aug 20-Dec 15, harvest Sep-Dec.', peak_doy: 288, half_window: 60 }
    ]
  },
  {
    name: 'Carob',
    members: ['Ceratonia siliqua'],
    anchor_zone: '9b', anchor_peak: 288, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Carob (Oregon State Landscape Plants + Backyard Forager)',
    source_url: 'https://landscapeplants.oregonstate.edu/plants/ceratonia-siliqua',
    summary: 'Carob: leathery pods ripe fall (Sep-Nov) in coastal CA; can persist on tree into winter.',
    regional_anchors: [
      { zones: ['9a','9b','10a','10b'], source: 'Oregon State Landscape Plants', url: 'https://landscapeplants.oregonstate.edu/plants/ceratonia-siliqua', summary: 'Pods reddish-brown when ripe in fall; drop Sep-Nov.', peak_doy: 288, half_window: 45 }
    ]
  },
  {
    name: 'Macadamia (smooth-shell)',
    members: ['Macadamia integrifolia'],
    anchor_zone: '10a', anchor_peak: 305, shift_per_half_zone: -3, half_window: 90,
    target_zones: ['9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Macadamia integrifolia (UH CTAHR + UC ANR Topics in Subtropics)',
    source_url: 'https://www.ctahr.hawaii.edu/oc/freepubs/pdf/C1-485.pdf',
    summary: 'Smooth-shell macadamia: nut-drop Jul-Mar in HI, peak Sep-Nov; San Diego CA similar.',
    regional_anchors: [
      { zones: ['11a','11b'], source: 'UH CTAHR macadamia', url: 'https://www.ctahr.hawaii.edu/oc/freepubs/pdf/C1-485.pdf', summary: 'Hawaii: nut-fall Jul-Mar, peak Sep-Nov.', peak_doy: 305, half_window: 90 },
      { zones: ['9b','10a','10b'], source: 'UC ANR Topics in Subtropics', url: 'https://ucanr.edu/blog/topics-subtropics/article/macadamia-production-california-hidden-gem-industry', summary: 'San Diego: fall-spring drop, similar to HI.', peak_doy: 320, half_window: 90 }
    ]
  },
  {
    name: 'Macadamia (rough-shell) late-year',
    members: ['Macadamia tetraphylla'],
    anchor_zone: '10a', anchor_peak: 335, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Macadamia tetraphylla late-year (Growables + CRFG)',
    source_url: 'https://www.growables.org/information/TropicalFruit/MacadamiaRough.htm',
    summary: 'Rough-shell macadamia Nov-Dec: opening half of the cited Nov-Apr CA nut-fall window. Pair with the Jan-Apr early-year row.'
  },
  {
    name: 'Macadamia (rough-shell) early-year',
    members: ['Macadamia tetraphylla'],
    anchor_zone: '10a', anchor_peak: 50, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Macadamia tetraphylla early-year (Growables + CRFG)',
    source_url: 'https://www.growables.org/information/TropicalFruit/MacadamiaRough.htm',
    summary: 'Rough-shell macadamia Jan-Apr: closing half of the cited Nov-Apr CA nut-fall window.'
  },
  {
    name: 'Citron (late-year)',
    members: ['Citrus medica'],
    anchor_zone: '9b', anchor_peak: 335, shift_per_half_zone: -2, half_window: 45,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Citron late-year (UC Riverside Citrus Variety Collection)',
    source_url: 'https://citrusvariety.ucr.edu/crc3768',
    summary: "Citron incl. Buddha's Hand Nov-Dec: opening half of the cited Nov-Mar window in CA/FL."
  },
  {
    name: 'Citron (early-year)',
    members: ['Citrus medica'],
    anchor_zone: '9b', anchor_peak: 45, shift_per_half_zone: -2, half_window: 45,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Citron early-year (UC Riverside Citrus Variety Collection)',
    source_url: 'https://citrusvariety.ucr.edu/crc3768',
    summary: "Citron Jan-Mar: closing half of the cited Nov-Mar window. Scattered year-round fruiting in frost-free locations."
  },
  {
    name: 'Kumquat (early-year)',
    members: ['Fortunella japonica', 'Fortunella margarita', 'Citrus japonica'],
    anchor_zone: '9b', anchor_peak: 32, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['8b','9a','9b','10a','10b','11a'],
    stage: 'ripe',
    source_name: 'Kumquat early-year (UF/IFAS FR368)',
    source_url: 'https://ask.ifas.ufl.edu/publication/FR368',
    summary: 'Kumquat Jan-Mar (FL) through Apr (CA): closing half of the Oct-Apr cropping window. Cold-hardy citrus relative; peak Jan.'
  },
  {
    name: 'Kumquat (late-year)',
    members: ['Fortunella japonica', 'Fortunella margarita', 'Citrus japonica'],
    anchor_zone: '9b', anchor_peak: 320, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['8b','9a','9b','10a','10b','11a'],
    stage: 'ripe',
    source_name: 'Kumquat late-year (UF/IFAS FR368)',
    source_url: 'https://ask.ifas.ufl.edu/publication/FR368',
    summary: 'Kumquat Oct-Dec: opening half of the FL Oct-Mar cropping window. Cold-hardy citrus.'
  },
  {
    name: 'Sour orange',
    members: ['Citrus aurantium', 'Citrus x aurantium'],
    anchor_zone: '9b', anchor_peak: 32, shift_per_half_zone: -2, half_window: 60,
    target_zones: ['8b','9a','9b','10a','10b','11a'],
    stage: 'ripe',
    source_name: 'Sour orange (NC State Plant Toolbox + UC Riverside CRC)',
    source_url: 'https://plants.ces.ncsu.edu/plants/citrus-x-aurantium/',
    summary: 'Sour / Seville orange: winter-ripening, peak Jan-Mar in CA/FL; long persistence on tree.',
    regional_anchors: [
      { zones: ['8b','9a','9b','10a','10b','11a'], source: 'UC Riverside CRC Orlando bittersweet', url: 'https://citrusvariety.ucr.edu/crc1588', summary: 'Riverside CA: ripe Jan-Mar.', peak_doy: 32, half_window: 60 }
    ]
  },
  {
    name: 'Pinyon pine',
    members: ['Pinus edulis'],
    anchor_zone: '6a', anchor_peak: 274, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Pinyon pine (USDA Silvics + Wikipedia + Chaffee Cty Times)',
    source_url: 'https://en.wikipedia.org/wiki/Pinus_edulis',
    summary: 'Pinyon pine: cones open Sep-Oct year 2 on CO Plateau; nut-gather late Aug-early Oct, peak Oct 1.',
    regional_anchors: [
      { zones: ['5a','5b','6a','6b'], source: 'Chaffee County Times (CO zone 6)', url: 'https://www.chaffeecountytimes.com/free_content/it-s-time-to-harvest-pi-on-pine-nuts/article_ee6e8614-12f3-11e2-bbc2-0019bb30f31a.html', summary: 'CO Rockies: late Aug to early Oct.', peak_doy: 265, half_window: 28 },
      { zones: ['6b','7a','7b'], source: 'Wikipedia / USDA Silvics', url: 'https://en.wikipedia.org/wiki/Pinus_edulis', summary: 'Lower-elev NM/AZ: cones open Sep-Oct, gather after first frost.', peak_doy: 288, half_window: 28 }
    ]
  },

  // ── Misc remaining-gaps batch 2026-05-10 ──
  {
    name: 'Japanese cornelian cherry',
    members: ['Cornus officinalis'],
    // Sister species to Cornus mas — similar timing, slightly earlier.
    anchor_zone: '6a', anchor_peak: 240, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'ripe',
    source_name: 'Japanese cornelian cherry (Missouri Botanical Garden + Cornell)',
    source_url: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=287086',
    summary: 'Japanese cornelian cherry (Cornus officinalis): ornamental ~2 weeks earlier than C. mas. Ripe Aug-Sep in zone 6. Tart cranberry-cherry flavor; used in TCM as well as jam/syrup.'
  },
  {
    name: 'American basswood (spring leaves)',
    members: ['Tilia americana'],
    anchor_zone: '6a', anchor_peak: 125, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'leaf',
    source_name: 'American basswood spring leaves (Forager Chef + Eat The Weeds)',
    source_url: 'https://foragerchef.com/american-basswood/',
    summary: 'American basswood (Tilia americana) young leaves: very tender for ~3 weeks centered on leaf-out (early May in zone 6, late April in warmer zones). Leaves get mucilaginous + tough quickly. Flowers are the more notable foraged part.'
  },
  {
    name: 'American basswood (flowers)',
    members: ['Tilia americana'],
    // Cited sources explicitly say "~2 weeks" of bloom. Earlier supports
    // had a 30-day window (167-197); audit narrowed to 22 days.
    anchor_zone: '6a', anchor_peak: 178, shift_per_half_zone: -3, half_window: 11,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'flower_harvest',
    source_name: 'American basswood flowers (Forager Chef + Practical Self Reliance)',
    source_url: 'https://foragerchef.com/american-basswood/',
    summary: 'American basswood (Tilia americana) flowers: ~2-week bloom in late Jun-early Jul (cold zones) shifting earlier in warm zones. Fragrant cymes for tea, infused honey. Pollinator-favored; harvest sparingly.'
  },
  {
    name: 'Spruce tips (multi-species)',
    // Pinus sp. removed 2026-05-10 — too generic, soft-deleted from
    // catalog. Specific Pinus species (contorta, sylvestris, edulis)
    // still get tips windows via their own membership.
    members: ['Picea glauca', 'Picea pungens', 'Picea sp.', 'Pinus contorta', 'Pinus sylvestris', 'Larix sibirica'],
    // Audit found "early-to-mid May" was interpreted as 31 days for spruce
    // tips when the cited window is famously 10-14 days. Tightened.
    // Replaces the earlier "Conifer tips" entry — same target zones,
    // narrower window.
    anchor_zone: '6a', anchor_peak: 130, shift_per_half_zone: -3, half_window: 10,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'shoot',
    source_name: 'Conifer spring tips (Forager Chef + foraging consensus)',
    source_url: 'https://foragerchef.com/pine-spruce-and-fir-tips/',
    summary: 'Conifer tips (spruce, pine, fir, larch): pale-green soft new-growth before needles harden. Famously short ~2-week window in early-to-mid May (zone 6). Citrusy resinous flavor; for syrups, salts, beverages. Avoid yew (toxic).'
  },
  {
    name: 'Siberian elm samaras',
    members: ['Ulmus pumila'],
    // Audit narrowed from {91, 130} (40d) and {105, 130} (26d) to a
    // 21-day "tender samaras" window. Heat-driven; warm zones earlier.
    anchor_zone: '6a', anchor_peak: 110, shift_per_half_zone: -3, half_window: 10,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'ripe',
    source_name: 'Siberian elm samaras (Forager Chef + Backyard Forager)',
    source_url: 'https://foragerchef.com/elm-samaras/',
    summary: 'Siberian elm (Ulmus pumila) samaras: tender, bright-green wings around mid-Apr in 6a — only edible for 1-3 weeks before they harden and turn papery. Eat raw, sautéed, or pickled.'
  },
  {
    name: 'Littleleaf linden (flowers)',
    members: ['Tilia cordata'],
    // Same flower-use pattern as American basswood — flowers for tea/sugar.
    anchor_zone: '6a', anchor_peak: 175, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'flower_harvest',
    source_name: 'Littleleaf linden (NC State Extension + foraging consensus)',
    source_url: 'https://plants.ces.ncsu.edu/plants/tilia-cordata/',
    summary: 'Littleleaf linden (Tilia cordata): fragrant pale-yellow flower clusters Jun-Jul (~10 days). Harvest at peak fragrance for tea (calming, mild honey flavor) — pollinator-favored, so leave half on the tree.'
  },
  {
    name: 'Japanese walnut',
    members: ['Juglans ailantifolia'],
    // Asian relative of butternut — same Sep-Oct nut drop.
    anchor_zone: '6a', anchor_peak: 274, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Japanese walnut (USDA Silvics + Forager Chef)',
    source_url: 'https://plants.usda.gov/plant-profile/JUAI',
    summary: 'Japanese walnut / heartnut (Juglans ailantifolia): hardier butternut relative. Nuts Sep-Oct in zone 6. Heart-shaped kernel cracks cleanly. Hardy 4-7.'
  },
  {
    name: 'Ussurian pear',
    members: ['Pyrus ussuriensis'],
    // Cold-hardy Asian pear, ornamental in US zones 3-7.
    // Shifted peak Sep 1 → Sep 15 + narrowed half_window 25 → 21 so the
    // window stays within the cited Sep-Oct range (was starting Aug 7).
    anchor_zone: '5b', anchor_peak: 258, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    stage: 'ripe',
    source_name: 'Ussurian pear (Missouri Botanical Garden + Wikipedia)',
    source_url: 'https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderDetails.aspx?taxonid=288124',
    summary: 'Ussurian pear (Pyrus ussuriensis): cold-hardy Asian pear, hardy zone 3. Small russeted fruit Sep-Oct, very astringent fresh — best after frost-blet or cooked.'
  },
  {
    name: 'American beautyberry',
    members: ['Callicarpa americana'],
    // Native SE US shrub. Vivid magenta drupe clusters Aug-Nov.
    // Widened half_window 35 → 45 so the Aug start matches the cited
    // "Aug-Nov" range (was starting late-Aug, missing 2-3 weeks).
    // Extended target to 6a (NC northern range / coastal VA).
    anchor_zone: '7b', anchor_peak: 270, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'ripe',
    source_name: 'American beautyberry (USDA Silvics + Eat The Weeds)',
    source_url: 'https://plants.usda.gov/plant-profile/CAAM2',
    summary: 'American beautyberry (Callicarpa americana): native SE-US understory shrub, vivid magenta drupe clusters Aug-Nov. Mealy-fruity-medicinal flavor — best for jelly. Leaves traditionally rubbed on skin as mosquito repellent.'
  },
  {
    name: 'Yarrow (leaves + flowers)',
    members: ['Achillea millefolium'],
    anchor_zone: '6a', anchor_peak: 175, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Yarrow (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/yarrow/',
    summary: 'Yarrow (Achillea millefolium): leaves all season (May-Oct, 6a); flowers Jun-Aug. Strong sage-savory flavor, traditional bitter. Use sparingly — high doses photosensitize.'
  },
  {
    name: 'Wild mint (leaves)',
    members: ['Mentha', 'Mentha arvensis', 'Mentha canadensis'],
    anchor_zone: '6a', anchor_peak: 175, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'leaf',
    source_name: 'Wild mint (NC State Extension + foraging consensus)',
    source_url: 'https://plants.ces.ncsu.edu/plants/mentha/',
    summary: 'Wild mint (Mentha spp.): leaves May-Oct in 6a, peak flavor pre-flowering (Jul). Look for square stems, opposite leaves, true mint smell — distinguish from non-aromatic mint-look-alikes.'
  },
  {
    name: 'Watercress',
    members: ['Nasturtium officinale'],
    // Cool-water aquatic. Best harvest spring (Apr-Jun) + fall (Sep-Nov);
    // summer growth gets bitter, can harbor more parasites in warm water.
    // ALWAYS cook unless sourced from verified clean water.
    anchor_zone: '6a', anchor_peak: 130, shift_per_half_zone: -3, half_window: 50,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Watercress (NC State Extension + foraging consensus)',
    source_url: 'https://plants.ces.ncsu.edu/plants/nasturtium-officinale/',
    summary: 'Watercress (Nasturtium officinale): cool-water aquatic, peak harvest Apr-Jun + Sep-Nov. ALWAYS cook unless source water is verified clean (giardia/liver-fluke risk in livestock-grazed streams).'
  },
  {
    name: 'Wild onion (Allium canadense)',
    members: ['Allium canadense'],
    // Native US onion. Leaves spring + early summer, bulbs after leaves
    // die back in late summer.
    // Shifted peak Apr 20 → May 1 + narrowed half_window 45 → 35 so the
    // window aligns with the cited Apr-Jun leaf-harvest range (was
    // starting Mar 6 — too early for most zones).
    anchor_zone: '6a', anchor_peak: 121, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Wild onion (USDA Silvics + Eat The Weeds)',
    source_url: 'https://plants.usda.gov/plant-profile/ALCA3',
    summary: 'Wild onion (Allium canadense, meadow garlic): native onion, leaves Apr-Jun, small bulbs ready Aug-Oct. ALWAYS confirm onion smell — death-camas + false-garlic are toxic lookalikes without the onion smell.'
  },
  // Bracken fern (Pteridium aquilinum) — REMOVED 2026-05-10.
  // Ptaquiloside is IARC Group 2B (possibly carcinogenic to humans);
  // traditional multi-blanching prep reduces but does not eliminate
  // the compound. Forager is a "go forage this" recommendation list,
  // not a comprehensive ID app — listing a known carcinogen as edible
  // even with a strong warning sends the wrong implicit signal. Other
  // spring shoots (ostrich fern fiddleheads, daylily, knotweed) are
  // non-carcinogenic alternatives. Species is soft-deleted via
  // is_forageable=false; the unify complex entry is intentionally
  // removed so the windows don't regenerate.
  {
    name: 'Greenbrier (spring shoots)',
    members: ['Smilax sp.', 'Smilax rotundifolia', 'Smilax bona-nox'],
    anchor_zone: '6a', anchor_peak: 122, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'shoot',
    source_name: 'Greenbrier (Eat The Weeds + foraging consensus)',
    source_url: 'https://www.eattheweeds.com/greenbrier-smilax-2/',
    summary: 'Greenbrier (Smilax spp.) spring shoots: tender new growth from tips before prickles harden, Apr-May in 6a. Cook like asparagus. The mature vines are thorny — harvest only the soft growing tip.'
  },
  // Conifer tips — soft new spring growth, ~2-3 weeks of harvestable
  // bright-green tips. Use for tea, syrup, garnish. Multiple Pinus +
  // Picea + Larix species share the same brief window. Heat-driven.
  {
    name: 'Conifer tips (multi-species)',
    members: ['Picea pungens', 'Pinus contorta', 'Pinus sylvestris', 'Larix sibirica', 'Pinus sp.', 'Picea sp.'],
    anchor_zone: '6a', anchor_peak: 130, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'shoot',
    source_name: 'Conifer spring tips (Forager Chef + foraging consensus)',
    source_url: 'https://foragerchef.com/pine-spruce-and-fir-tips/',
    summary: 'Conifer tips (spruce, pine, fir, larch): pale-green soft new-growth shoots before needles harden. ~2-3 week window late Apr - May in 6a. Citrusy resinous flavor; for syrups, salts, beverages. Avoid yew (toxic).'
  },
  {
    name: 'Wood ear',
    members: ['Auricularia auricula-judae'],
    // Wood-decay mushroom. Year-round in temperate climates, flushes
    // after rain. Most active spring + fall.
    anchor_zone: '6a', anchor_peak: 274, shift_per_half_zone: -3, half_window: 80,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Wood ear (Mushroom Expert + Forager Chef)',
    source_url: 'https://www.mushroomexpert.com/auricularia_auricula.html',
    summary: 'Wood ear (Auricularia auricula-judae): gelatinous brown ear-shaped fungus on dead/dying hardwoods (esp. elder, beech). Year-round in mild climates, peak spring + fall flushes after rain. Cook before eating.'
  },

  // Cherry/Plum (unspecified) (Prunus sp.) — generic Prunus catch-all.
  // Wide window covering plum + cherry timing (~Jul-Aug zone 6a). Use
  // when species ID is uncertain.
  {
    name: 'Cherry/Plum (unspecified)',
    members: ['Prunus sp.'],
    anchor_zone: '6a', anchor_peak: 207, shift_per_half_zone: -4, half_window: 35,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'ripe',
    source_name: 'Prunus sp. (genus catch-all — wide window)',
    source_url: 'https://en.wikipedia.org/wiki/Prunus',
    summary: 'Generic Prunus (cherries / plums): catch-all when species not identified. Wide window (~Jun-Sep in 6a) covers genus variability.'
  },

  // Chicken of the woods (Laetiporus sulphureus) — choice fall mushroom,
  // bright orange shelf fungus on hardwoods (oak especially). Peak
  // flush Aug-Oct in NE; can also fruit in spring (May-Jun) but fall
  // is dominant.
  {
    name: 'Chicken of the woods',
    members: ['Laetiporus sulphureus'],
    anchor_zone: '6a', anchor_peak: 244, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Chicken of the woods (Mushroom Expert + Audubon)',
    source_url: 'https://www.mushroomexpert.com/laetiporus_sulphureus.html',
    summary: 'Chicken of the woods (Laetiporus sulphureus): bright orange shelf fungus on hardwoods (esp. oak). Peak flush Aug-Oct (zone 6a); occasional spring flush.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Northeast Mycological Federation', url: 'https://newenglandmushrooms.com/', summary: 'NE: Aug-Oct main flush; occasional Jun fruiting.', peak_doy: 244, half_window: 35 },
      { zones: ['7a','7b','8a','8b'], source: 'NC State Extension', url: 'https://content.ces.ncsu.edu/', summary: 'Mid-Atlantic / South: Jul-Sep flush.', peak_doy: 220, half_window: 30 }
    ]
  },

  // ── Tier 1: must-have foragables (added 2026-05-10) ──

  // Cattail (Typha) — multi-stage forage. Spring shoots, summer pollen,
  // fall corm/rhizome. Heat-driven for shoots (early spring); cattail
  // pollen tracks the same gradient ~6 weeks later; rhizome dig is
  // year-round but traditional in fall.
  {
    name: 'Cattail (spring shoots)',
    members: ['Typha latifolia', 'Typha angustifolia'],
    anchor_zone: '6a', anchor_peak: 121, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'shoot',
    source_name: 'Cattail spring shoots (foraging consensus + Wikipedia)',
    source_url: 'https://en.wikipedia.org/wiki/Typha',
    summary: 'Cattail spring shoots: tender white core of young rhizome shoots. Apr-Jun depending on zone; mild heat-driven gradient.'
  },
  {
    name: 'Cattail (pollen / flower)',
    members: ['Typha latifolia', 'Typha angustifolia'],
    anchor_zone: '6a', anchor_peak: 176, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'flower_harvest',
    source_name: 'Cattail pollen (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/cattails-a-survival-dinner/',
    summary: 'Cattail pollen (Typha latifolia / angustifolia): the upper male spike turns mustard-yellow and dusty in late June (zone 6a) — bend the head into a paper bag and shake/tap to collect a fine bright-yellow flour. Brief 1-2 week window. Use 50/50 with wheat flour in pancakes, cornbread, or biscuits for a nutty, slightly sweet, vitamin-rich (carotenoids, protein) bake. Euell Gibbons called cattails the "supermarket of the swamp." T. latifolia has the male and female spikes touching; T. angustifolia has a visible gap between them — either species\' pollen is usable. IDENTIFICATION CRITICAL: do not confuse young vegetative cattails with iris (Iris pseudacorus / I. versicolor) — iris leaves are flat-faced and arise from a fan-shaped base; cattail leaves are round-backed and arise rounded. Iris is toxic.'
  },
  {
    name: 'Cattail (fall rhizome)',
    members: ['Typha latifolia', 'Typha angustifolia'],
    // Peak shifted Oct 12 → Nov 1 + half_window 35 → 55 so the fall
    // window extends into Dec (was dying mid-Nov despite cited "fall
    // through early-spring"). Cant cleanly represent Jan-Mar in one
    // row without DOY year-wrap support; a Winter rhizome entry below
    // covers that range as a second row.
    anchor_zone: '6a', anchor_peak: 305, shift_per_half_zone: -2, half_window: 55,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'root_dig',
    source_name: 'Cattail rhizome (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/cattails-a-survival-dinner/',
    summary: 'Cattail rhizome (Typha latifolia / angustifolia): fat horizontal underground stems running between plants in shallow water mud. Best after first frost (Oct-Nov in 6a) when the plant has translated sugars and starch downward — peels white, snaps crisp, tastes like raw sweet corn. Two methods: pound and rinse to wash starch out into water (settle, decant, dry → flour), or peel and grill/roast whole sections. Crushed cooked yield is roughly 6,500 lb starch per cultivated acre — a major historical wild staple from First Nations through Russian wartime famine ration. NOT for industrial/contaminated wetlands — rhizomes concentrate heavy metals and agricultural runoff. Confirm clean water source before harvest. ID warning: avoid confusion with iris (toxic) — see pollen entry.'
  },
  {
    // Second row covering Jan-Mar — DOY 1-90 — separate from the fall
    // row because the framework rows do not wrap year-end.
    name: 'Cattail (winter rhizome)',
    members: ['Typha latifolia', 'Typha angustifolia'],
    anchor_zone: '6a', anchor_peak: 35, shift_per_half_zone: -2, half_window: 50,
    target_zones: ['5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'root_dig',
    source_name: 'Cattail winter rhizome (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/cattails-a-survival-dinner/',
    summary: 'Cattail winter rhizome (Typha latifolia / angustifolia): continuation of the fall harvest into Jan-Mar, separate row because the DOY framework does not wrap year-end. Where standing water stays unfrozen (zones 5b+) you can wade in or break thin surface ice and pull rhizomes from the mud all winter — starch stays concentrated until the plant breaks dormancy and re-mobilizes it upward in early spring. The very last good harvest window in Mar before new shoots draw the starch back up. Confirm clean water source (rhizomes concentrate heavy metals); avoid iris confusion (see pollen entry).'
  },

  // Ostrich fern fiddleheads — major NE / Maritime spring forage.
  {
    name: 'Ostrich fern fiddleheads',
    members: ['Matteuccia struthiopteris'],
    anchor_zone: '6a', anchor_peak: 121, shift_per_half_zone: -3, half_window: 14,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    stage: 'shoot',
    source_name: 'Ostrich fern (Maine + Vermont extension services)',
    source_url: 'https://extension.umaine.edu/publications/2540e/',
    summary: 'Ostrich fern fiddleheads: tightly-coiled croziers, brief 1-2 week window mid-Apr to mid-May. Boil 15 min before eating.'
  },

  // Wild strawberry complex — F. virginiana + F. vesca share timing.
  // Reduced shift_per_half_zone from -4 to -2 and widened half_window from
  // 21 to 25 so cold-zone start dates match iNat (p10-p15 sits in mid-Jun
  // for 3a-4a; -4 shift pushed the anchor start to late Jun/early Jul).
  // Strawberries aren't strongly heat-driven across latitude: cold zones
  // ripen alongside snowmelt + ground-warming, often closer to mid-summer
  // than the heat-budget model predicts.
  {
    name: 'Wild strawberry (Fragaria) complex',
    members: ['Fragaria virginiana', 'Fragaria vesca'],
    anchor_zone: '6a', anchor_peak: 176, shift_per_half_zone: -2, half_window: 25,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Wild strawberry complex (USDA Silvics + foraging guides)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=FRVI',
    summary: 'Wild strawberry: mid-Jun through Jul ripe across temperate NA. F. virginiana (meadows) and F. vesca (woodland) share harvest timing. Cold-zone (3a-4b) start can be as early as mid-Jun.'
  },

  // Mayapple — fruit only edible (rest toxic).
  {
    name: 'Mayapple',
    members: ['Podophyllum peltatum'],
    anchor_zone: '6a', anchor_peak: 213, shift_per_half_zone: -4, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'ripe',
    source_name: 'Mayapple (Eat The Weeds + USDA Silvics)',
    source_url: 'https://www.eattheweeds.com/podophyllum-mayapple-mandrake-mountain-apple-2/',
    summary: 'Mayapple fruit: yellow-translucent ripe in late summer (Jul-Aug). Only ripe yellow fruit edible; all other parts toxic.'
  },

  // Sweet birch (Betula lenta) — sap_run + wintergreen-twig forage.
  {
    name: 'Sweet birch (sap)',
    members: ['Betula lenta', 'Betula alleghaniensis'],
    anchor_zone: '6a', anchor_peak: 65, shift_per_half_zone: 3, half_window: 28,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    stage: 'sap_run',
    source_name: 'Sweet/yellow birch sap (Cornell Maple Program + UVM Extension)',
    source_url: 'https://maple.dnr.cornell.edu/pubs/birch_sap.htm',
    summary: 'Sweet/yellow birch sap: late-winter / early-spring tap. ~2 weeks after maple sap window closes; lower sugar yield (~100:1 ratio for syrup).',
    regional_anchors: [
      { zones: ['3a','3b','4a','4b','5a'], source: 'Cornell Maple Program (Adirondack/Catskills)', url: 'https://maple.dnr.cornell.edu/pubs/birch_sap.htm', summary: 'NE highlands: tap mid-March to late-April for birch sap.', peak_doy: 90, half_window: 21 },
      { zones: ['5b','6a','6b','7a'], source: 'UVM Maple Sugar Makers (Vermont birches)', url: 'https://www.uvm.edu/extension/sugarmakers/', summary: 'VT/NH: tap late Feb to late March; ~2 weeks after maple finishes.', peak_doy: 70, half_window: 21 }
    ]
  },

  // ── Tier 2: roadside greens ──

  {
    name: 'Wood sorrel (leaves)',
    members: ['Oxalis stricta'],
    // Shifted peak Jun 1 → Jul 15 + widened half_window 60 → 110 so
    // the window actually covers "all growing season" as the summary
    // claims (zone 6a Apr - early Nov). Earlier centering at Jun cut
    // the window off mid-summer, leaving Aug-Oct empty.
    anchor_zone: '6a', anchor_peak: 196, shift_per_half_zone: -2, half_window: 110,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'leaf',
    source_name: 'Wood sorrel (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/oxalis-how-to-drown-your-sorrels/',
    summary: 'Common yellow wood sorrel (Oxalis stricta): three heart-shaped (notched) leaflets that fold down at night and in heavy sun, small five-petaled yellow flowers, slender okra-shaped seed pods that pop when ripe. Distinct from clover (Trifolium) which has rounded oval leaflets and a chevron mark — wood sorrel leaflets are clearly heart-shaped with a sour lemony taste. Edible leaves, flowers, and green seed-pods all growing season (Apr-Nov in 6a). Uses: tart trailside nibble, lemony garnish for salads/fish, Mexican xocoyolli wild-greens dish, herbal cold tea (cold infusion, not hot — heat dulls the flavor). OXALIC ACID CAUTION: small amounts only; daily large servings can interfere with calcium absorption and aggravate kidney stones/gout. Cooking with a calcium source (milk, cheese) reportedly neutralizes the oxalate.'
  },
  {
    name: 'Curly dock (leaves)',
    members: ['Rumex crispus'],
    anchor_zone: '6a', anchor_peak: 105, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Curly dock (foraging consensus + USDA Silvics)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=RUCR',
    summary: 'Curly dock young leaves: pre-flower-stalk rosette stage, late spring. Older leaves more bitter; cook with greens.'
  },
  {
    name: 'Sheep sorrel (leaves)',
    members: ['Rumex acetosella'],
    anchor_zone: '6a', anchor_peak: 121, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Sheep sorrel (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/sorrel-not-a-sheepish-rumex/',
    summary: 'Sheep sorrel (Rumex acetosella): lime-green arrow/halberd-shaped leaves with two backward-pointing basal lobes — instantly identifiable from a distance by color, no taproot, mat-forming, rarely above 18 inches. Tart lemony bite from oxalic acid. Best harvested young in late Apr through mid-Jun in 6a; older leaves get tougher and the reddish flower stalks signal a flavor decline. Uses: classic French sorrel soup (soupe à l\'oseille), green sauce for poached salmon, lemony salad accent, blended into chimichurri or pesto for a tart edge, an ingredient in Essiac herbal tea. OXALIC ACID CAUTION: avoid if you have kidney stones, gout, or rheumatoid arthritis; can interfere with calcium and iron absorption — don\'t take alongside mineral supplements.'
  },
  {
    name: 'Mugwort (leaves)',
    members: ['Artemisia vulgaris'],
    anchor_zone: '6a', anchor_peak: 152, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Mugwort (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/artemisia-vulgaris-mugwort/',
    summary: 'Mugwort (Artemisia vulgaris): bitter aromatic herb, harvest young leaves + flowering tops in late May - mid Jul before plant fully blooms. Long traditional use: Korean ssuk rice cake, Japanese mochi, Old-World goose-stuffing bitter, pre-hops beer flavoring, moxibustion (burned on acupressure points in TCM), smudge incense. Lucid-dreaming folk-aid (compounds in essential oil). PREGNANCY CONTRAINDICATION: thujone is uterine-stimulant — avoid entirely during pregnancy. Not for daily consumption in any context; bitter principle (santonin) is a stomach irritant in quantity.'
  },
  {
    name: 'Highbush cranberry',
    members: ['Viburnum trilobum'],
    anchor_zone: '6a', anchor_peak: 270, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b'],
    stage: 'ripe',
    source_name: 'Highbush cranberry (USDA Silvics + foraging guides)',
    source_url: 'https://www.fs.fed.us/database/feis/plants/shrub/vibtri/all.html',
    summary: 'Highbush cranberry (Viburnum trilobum): bright red drupes Sep-Nov, sweetened by frost. Distinct from European V. opulus (toxic).'
  },
  {
    name: 'Cornelian cherry',
    members: ['Cornus mas'],
    // Native SE Europe / W Asia, naturalized as ornamental in NE/Mid-Atlantic
    // US. Ripens mid- to late summer. Cornell-area / Druid's Garden W. PA:
    // peak early-mid Sep ("near fall equinox"). UW Botanic Garden Seattle:
    // Aug-Sep. iNat-only synth peaks Aug 8–29 (left-shifted, per memory).
    // Cited sources push the peak ~1-2 weeks later than iNat — keep both.
    anchor_zone: '6a', anchor_peak: 248, shift_per_half_zone: -3, half_window: 32,
    target_zones: ['4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Cornelian cherry (Cornell + UW BG + Druid\'s Garden)',
    source_url: 'https://botanicgardens.uw.edu/about/blog/2023/08/01/august-2023-plant-profile-cornelian-cherry/',
    summary: 'Cornelian cherry (Cornus mas): cherry-red drupes Aug-Sep, peak early-mid Sep in zone 6. Tart cranberry-cherry flavor — best for jam, syrup, soda; eaten ripe (just dropped or near-drop).',
    regional_anchors: [
      { zones: ['4b','5a','5b','6a','6b'], source: 'Druid\'s Garden + Cornell Cooperative Extension', url: 'https://thedruidsgarden.com/2017/09/14/urban-food-profile-cornelian-cherry-harvest-and-recipe-for-soda-syrup-jam-pickles-and-more/', summary: 'NE / mid-Atlantic: peak early-mid September, fruits drop near fall equinox. Author harvests in rural western PA mid-Sep.', peak_doy: 255, half_window: 28 },
      { zones: ['6a','6b','7a','7b'], source: 'UW Botanic Garden + Missouri Botanical Garden', url: 'https://botanicgardens.uw.edu/about/blog/2023/08/01/august-2023-plant-profile-cornelian-cherry/', summary: 'Mid-Atlantic / maritime: Aug-Sep ripening, peak late Aug.', peak_doy: 240, half_window: 28 },
      { zones: ['7b','8a','8b'], source: 'PFAF + nursery references', url: 'https://pfaf.org/user/plant.aspx?latinname=Cornus+mas', summary: 'Warmer ranges (zone 7-8 cultivation): peak mid-Aug, earliest cultivars early Aug.', peak_doy: 225, half_window: 25 }
    ]
  },
  {
    name: 'Rugosa rose hips',
    members: ['Rosa rugosa'],
    // Frost-sweetened — best harvest after first light frost when hips are
    // fully colored but still firm. iNat fruiting reports skew earlier
    // (people notice red hips when they first appear, not edible peak).
    // Cited sources: Vermont (zone 4) late-Aug start, Sep-early Oct peak;
    // joybilee Farm zone 3 emphasizes post-frost harvest. Window covers
    // Aug ripening through Oct-Nov frost-sweetened peak.
    anchor_zone: '5b', anchor_peak: 268, shift_per_half_zone: 2, half_window: 35,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Rugosa rose hips (Practical Self Reliance + Joybilee Farm + NC State)',
    source_url: 'https://practicalselfreliance.com/rose-hips/',
    summary: 'Rugosa rose hips: ripen late Aug, peak harvest Sep-Oct after first light frost (sweetens, gains vitamin C). Hips persist into winter; frost-touched are sweetest but soften — harvest firm-ripe for storage.',
    regional_anchors: [
      { zones: ['3a','3b','4a','4b'], source: 'Joybilee Farm + Practical Self Reliance (Vermont zone 4)', url: 'https://practicalselfreliance.com/rose-hips/', summary: 'Cold zones (3-4): hips start ripening late Aug, peak harvest Sep through early Oct after first light frost.', peak_doy: 263, half_window: 35 },
      { zones: ['4b','5a','5b','6a','6b'], source: 'Backyard Forager + Homestead and Chill', url: 'https://backyardforager.com/rose-hips-harvest-process/', summary: 'NE / Mid-Atlantic: Sep-Oct peak, picking continues through Oct-Nov frosts.', peak_doy: 275, half_window: 35 },
      { zones: ['6b','7a','7b','8a'], source: 'NC State Extension', url: 'https://plants.ces.ncsu.edu/plants/rosa-rugosa/', summary: 'Mid-S / coastal: hips present Aug onward, frost-driven peak Oct-Nov.', peak_doy: 285, half_window: 35 }
    ]
  },
  {
    name: 'Olive',
    members: ['Olea europaea'],
    // Mediterranean / California cultivation, USDA zone 8+. Table olives
    // start green-harvest Sep (Tulare County), oil olives mid-Oct through
    // Nov. Sonoma County coastal: Nov through Feb. Mediterranean
    // (Spain/Italy/Greece): Oct-Dec. Wide window since both green-stage
    // and black-stage are harvested.
    anchor_zone: '9b', anchor_peak: 298, shift_per_half_zone: -5, half_window: 50,
    target_zones: ['8b','9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Olive (Big Horn Olive Oil + California Grown + Olive Oil Times)',
    source_url: 'https://bhooc.com/blogs/articles/olive-harvest-california-timing-trends',
    summary: 'Olive (Olea europaea): table olives Sep-Nov, oil olives mid-Oct through Nov in Central Valley CA; cooler coastal areas (Sonoma, coastal Spain) Nov through Jan/Feb. Hardy zone 8+; needs hot summer.',
    regional_anchors: [
      { zones: ['8b','9a','9b'], source: 'Big Horn Olive Oil + California Grown (Tulare County, Central Valley)', url: 'https://bhooc.com/blogs/articles/olive-harvest-california-timing-trends', summary: 'Central Valley CA: table olives Sep through mid-Nov (~56% of US olive production from Tulare County), oil olives mid-Oct through Nov.', peak_doy: 295, half_window: 45 },
      { zones: ['9b','10a','10b'], source: 'Olive Oil Times + Oliviers & Co (Mediterranean)', url: 'https://www.oliveoiltimes.com/production/a-hobby-growers-guide-to-the-olive-harvest/125444', summary: 'Mediterranean / coastal CA: Oct-Dec, late cultivars stretch into Feb.', peak_doy: 310, half_window: 50 }
    ]
  },

  // ── Tier 3: edible mushrooms ──

  {
    name: 'Common puffball',
    members: ['Lycoperdon perlatum'],
    // Aug-Oct flush, peak ~early Sep. Widened from half_window 30 → 40 so the
    // tail actually reaches into Oct (the source says "Aug-Oct" and a Sep-1
    // ±30 window dies on Oct 1, leaving ~no October). Mushroom flushes
    // ramp up before peak and persist into killing frost, so the symmetric
    // half-window is a compromise — leaning toward the long tail.
    anchor_zone: '6a', anchor_peak: 250, shift_per_half_zone: -3, half_window: 40,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Common puffball (Audubon mushroom guide + Mushroom Expert)',
    source_url: 'https://www.mushroomexpert.com/lycoperdon_perlatum.html',
    summary: 'Common puffball: Aug through Oct, peak early Sep, persists into first hard frost. Cut in half — pure white interior confirms (rules out toxic Amanita "egg" stage).',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b','7a'], source: 'Northeast foraging guides (Wild Mushrooms of NE)', url: 'https://www.audubon.org/fieldguide/mushrooms', summary: 'NE forager consensus: Aug-Oct flush, peak early Sep, hangs on until first hard frost.', peak_doy: 250, half_window: 40 },
      { zones: ['7a','7b','8a','8b'], source: 'NC State Extension (Carolinas mushroom timing)', url: 'https://content.ces.ncsu.edu/', summary: 'Southern Appalachians: Jul-Oct flush, peak late Aug.', peak_doy: 235, half_window: 40 }
    ]
  },
  {
    name: 'Giant puffball',
    members: ['Calvatia gigantea'],
    // Late-Aug through Oct. Widened half_window so the synth includes
    // mid-Oct, matching the cited "Aug-Oct flush" descriptions.
    anchor_zone: '6a', anchor_peak: 260, shift_per_half_zone: -3, half_window: 38,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Giant puffball (Mushroom Expert + foraging guides)',
    source_url: 'https://www.mushroomexpert.com/calvatia_gigantea.html',
    summary: 'Giant puffball: late-Aug through Oct, peak mid-Sep. Soccer-ball-sized; one mushroom can feed a family.',
    regional_anchors: [
      { zones: ['3a','3b','4a','4b','5a','5b','6a'], source: 'Audubon Field Guide (Northeast)', url: 'https://www.audubon.org/fieldguide/mushrooms', summary: 'NE Audubon: Aug-Oct flush, peak mid-Sep, persists until killing frost.', peak_doy: 260, half_window: 38 },
      { zones: ['6b','7a','7b','8a','8b'], source: 'NC State Extension', url: 'https://content.ces.ncsu.edu/', summary: 'Mid-Atlantic / South: Jul-Oct flush, peak late Aug to early Sep.', peak_doy: 245, half_window: 38 }
    ]
  },
  {
    name: 'Black trumpet',
    members: ['Craterellus cornucopioides'],
    anchor_zone: '6a', anchor_peak: 227, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'Black trumpet (Mushroom Expert + Wild Mushrooms of NE)',
    source_url: 'https://www.mushroomexpert.com/craterellus_cornucopioides.html',
    summary: 'Black trumpet: Jul-Sep under hardwoods (oak/beech). Earthy, smoky flavor; dries beautifully.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Northeast Mycological Federation', url: 'https://newenglandmushrooms.com/', summary: 'NE: Jul-Sep, hardwood forests with oak and beech.', peak_doy: 227, half_window: 35 },
      { zones: ['6b','7a','7b','8a'], source: 'NC State Extension (Carolinas mushroom timing)', url: 'https://content.ces.ncsu.edu/', summary: 'Carolinas: Jun-Aug flush in oak forests.', peak_doy: 196, half_window: 35 }
    ]
  },
  {
    name: 'Wood blewit',
    members: ['Lepista nuda'],
    anchor_zone: '6a', anchor_peak: 288, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Wood blewit (Mushroom Expert)',
    source_url: 'https://www.mushroomexpert.com/lepista_nuda.html',
    summary: 'Wood blewit: late-fall mushroom (Oct-Dec), often after first frosts. Lavender coloring; spore print pinkish-buff.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b','7a'], source: 'Audubon Field Guide (Northeast)', url: 'https://www.audubon.org/fieldguide/mushrooms', summary: 'NE: Oct-Dec, often after first frost. Look in leaf litter under hardwoods.', peak_doy: 288, half_window: 35 },
      { zones: ['7a','7b','8a','8b'], source: 'Wild Food Girl + Forager Chef', url: 'https://www.wildfoodgirl.com/', summary: 'Southern range: Nov-Jan flush.', peak_doy: 320, half_window: 35 }
    ]
  },
  {
    name: 'Golden chanterelle',
    members: ['Cantharellus cibarius'],
    // Mycorrhizal with oak/beech (NE) and conifers (PNW). Jul-Sep flush
    // in NE/Midwest, Jun-Oct in maritime PNW (cooler, wetter), Jul-Nov
    // in southern Appalachians (long humid season).
    anchor_zone: '6a', anchor_peak: 213, shift_per_half_zone: -3, half_window: 40,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Golden chanterelle (Mushroom Expert + Audubon)',
    source_url: 'https://www.mushroomexpert.com/cantharellus_cibarius.html',
    summary: 'Golden chanterelle: Jul-Sep flush across NE/Midwest hardwoods (esp. oak/beech), Jun-Oct in PNW conifers. Fruity apricot smell + forked false-gills (not true gills) distinguish from toxic Jack-O-Lantern (Omphalotus).',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Northeast Mycological Federation', url: 'https://newenglandmushrooms.com/', summary: 'NE: Jul through Sep, peak early Aug under oak. Triggered by warm humid weeks following rain.', peak_doy: 213, half_window: 35 },
      { zones: ['6b','7a','7b','8a'], source: 'NC State Extension (Carolinas mushroom timing)', url: 'https://content.ces.ncsu.edu/', summary: 'Southern Appalachians: Jul through Oct, peak mid-Aug, second flush late Sep.', peak_doy: 220, half_window: 45 },
      { zones: ['7b','8a','8b'], source: 'Mycological Society of San Francisco (PNW + N CA)', url: 'https://www.mssf.org/', summary: 'Maritime PNW / N California: Sep through Dec (winter peak), driven by autumn rains.', peak_doy: 305, half_window: 40 }
    ]
  },
  {
    name: 'Hen of the woods',
    members: ['Grifola frondosa'],
    // Saprotrophic at base of mature oaks (esp. white oak). Sep-Oct
    // primarily, may persist into Nov. Same individual returns year
    // after year. Driven by cooling soil + autumn rains.
    anchor_zone: '6a', anchor_peak: 265, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'Hen of the woods (Mushroom Expert + Forager Chef)',
    source_url: 'https://www.mushroomexpert.com/grifola_frondosa.html',
    summary: 'Hen of the woods (Grifola frondosa, maitake): large rosette-like cluster at base of oaks. Sep-Oct flush triggered by cooling + rain. Same individuals return annually — note locations.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Forager Chef + Audubon Field Guide', url: 'https://foragerchef.com/hen-of-the-woods/', summary: 'NE/Midwest: late Sep through Oct, peak early Oct, occasional second flush after warm rains.', peak_doy: 275, half_window: 28 },
      { zones: ['6b','7a','7b','8a'], source: 'NC State Extension', url: 'https://content.ces.ncsu.edu/', summary: 'Mid-Atlantic / southern range: Sep through Nov, peak mid-Oct.', peak_doy: 282, half_window: 30 }
    ]
  },
  {
    name: 'Oyster mushroom',
    members: ['Pleurotus ostreatus'],
    // Saprotrophic on dead/dying hardwoods (esp. aspen, beech, maple).
    // Cold-tolerant: NE flushes ~50-65°F daytime temps, so spring (Apr-May)
    // and fall (Sep-Nov) peaks with a summer lull. Warm-zone winter
    // flushes too. Year-round in PNW where temps stay mild.
    anchor_zone: '6a', anchor_peak: 285, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Oyster mushroom (Mushroom Expert + Wild Food Girl)',
    source_url: 'https://www.mushroomexpert.com/pleurotus_ostreatus.html',
    summary: 'Oyster mushroom (Pleurotus ostreatus): cold-tolerant, two flushes annually (spring + fall) in NE, plus winter flushes in warm zones. Look on dead/dying hardwoods (aspen, beech, maple).',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b','7a'], source: 'Audubon Field Guide + Wild Food Girl', url: 'https://www.audubon.org/fieldguide/mushrooms', summary: 'NE: cold-tolerant species — spring flush late-Apr through May, fall flush Sep through Nov. Bimodal pattern with summer lull.', peak_doy: 285, half_window: 70 },
      { zones: ['7a','7b','8a','8b'], source: 'Mushroom Mountain (SE US)', url: 'https://mushroommountain.com/', summary: 'Mid-S / SE: year-round on dead hardwoods, with peak flushes after cool rains Oct-Dec.', peak_doy: 320, half_window: 90 }
    ]
  },
  {
    name: 'Lion\'s mane',
    members: ['Hericium erinaceus'],
    // Saprotrophic on dead/wounded hardwoods (esp. beech, oak, maple).
    // Aug-Nov in NE, single annual flush per fruiting body. Cold-tolerant
    // — often produced after first cool nights.
    anchor_zone: '6a', anchor_peak: 275, shift_per_half_zone: -3, half_window: 40,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'Lion\'s mane (Mushroom Expert + Forager Chef)',
    source_url: 'https://www.mushroomexpert.com/hericium_erinaceus.html',
    summary: 'Lion\'s mane (Hericium erinaceus): white cascading "icicles" on dead/wounded beech, oak, maple. Aug-Nov in NE, single flush per fruiting body. Cool-temperature trigger.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Forager Chef + Northeast Mycological Federation', url: 'https://foragerchef.com/lions-mane/', summary: 'NE: Aug through Nov, peak Oct, often visible from a distance against bark.', peak_doy: 285, half_window: 40 },
      { zones: ['6b','7a','7b','8a'], source: 'Mushroom Mountain (SE US)', url: 'https://mushroommountain.com/', summary: 'Mid-Atlantic / SE: Sep through Dec, peak early-Nov.', peak_doy: 305, half_window: 40 }
    ]
  },
  {
    name: 'King bolete',
    members: ['Boletus edulis'],
    // Mycorrhizal with conifers (spruce/fir/pine) + birch. Highly variable
    // — depends on summer rains + temperature drop. NE: Jul-Sep peak.
    // Maritime PNW: fall fruiting Oct-Dec. Rocky Mountains: monsoon-driven
    // late-Jul through early Sep.
    anchor_zone: '6a', anchor_peak: 230, shift_per_half_zone: -3, half_window: 40,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'King bolete / porcini (Mushroom Expert + Audubon)',
    source_url: 'https://www.mushroomexpert.com/boletus_edulis.html',
    summary: 'King bolete (Boletus edulis, porcini, cep): mycorrhizal with conifers + birch. Brown cap, white pore surface (not gills), no staining when cut. Jul-Sep in NE/Rockies, Oct-Dec in maritime PNW.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a','6b'], source: 'Northeast Mycological Federation', url: 'https://newenglandmushrooms.com/', summary: 'NE: Jul-Sep flush with conifers (spruce, hemlock) + birch, peak mid-Aug. Highly weather-dependent.', peak_doy: 230, half_window: 40 },
      { zones: ['6b','7a','7b','8a'], source: 'Mycological Society of San Francisco (PNW)', url: 'https://www.mssf.org/', summary: 'Maritime PNW / N California: fall fruiting Oct through Dec under spruce/pine.', peak_doy: 305, half_window: 40 }
    ]
  },
  {
    name: 'Shaggy mane',
    members: ['Coprinus comatus'],
    // Saprotrophic in disturbed soil — lawns, gravel, hard-packed earth.
    // Cool-temperature fall flush primarily (Sep-Nov), occasional spring.
    // Auto-digests into black "ink" within 48hr of opening — must
    // harvest day-of.
    anchor_zone: '6a', anchor_peak: 275, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Shaggy mane (Mushroom Expert + Audubon)',
    source_url: 'https://www.mushroomexpert.com/coprinus_comatus.html',
    summary: 'Shaggy mane (Coprinus comatus, lawyer\'s wig): cylindrical white-shaggy cap on disturbed soil — lawns, gravel paths, roadsides. Fall flush Sep-Nov. Auto-digests to black ink within 48 hr — harvest fresh, eat same day.',
    regional_anchors: [
      { zones: ['3a','3b','4a','4b','5a','5b','6a','6b'], source: 'Audubon Field Guide (Northeast) + Wild Food Girl', url: 'https://www.audubon.org/fieldguide/mushrooms', summary: 'NE: Sep-Nov fall flush, peak Oct, after cool nights. Occasional spring flush in zones 5-6.', peak_doy: 280, half_window: 35 },
      { zones: ['6b','7a','7b','8a','8b'], source: 'NC State Extension', url: 'https://content.ces.ncsu.edu/', summary: 'Mid-Atlantic / SE: Oct-Dec primary flush.', peak_doy: 295, half_window: 35 }
    ]
  },

  // ── Tier 4: spring ephemerals ──

  {
    name: 'Trout lily (leaves + corm)',
    members: ['Erythronium americanum'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Trout lily (Forager Chef + Eat The Weeds + USDA Plant Profile)',
    source_url: 'https://foragerchef.com/trout-lily/',
    summary: 'Yellow trout lily (Erythronium americanum): two mottled brown-on-green basal leaves (resembling brook-trout markings) with a single nodding yellow lily flower, Apr through mid-May only in zone 6a. CONSERVATION CAUTION — STRONGLY DISCOURAGE HARVEST: spring ephemeral that takes ~7 years from seed to flowering, propagates mostly by underground stolons, and populations collapse irreversibly when over-foraged. Removing a leaf can kill the plant (only two leaves total, plant relies on them for the entire year\'s photosynthesis). Bulbs are emetic in any quantity and have a documented anti-fertility / contraceptive effect — both Sam Thayer and Alan Bergo (Forager Chef) explicitly advise against serving to guests or harvesting commercially. Best treated as a wildflower to enjoy, photograph, and leave alone. If you must, restrict to a single leaf from a flowering (not single-leaf juvenile) plant in a verified abundant colony.'
  },
  {
    name: 'Spring beauty',
    members: ['Claytonia virginica'],
    anchor_zone: '6a', anchor_peak: 91, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Spring beauty (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/spring-beauty/',
    summary: 'Spring beauty (Claytonia virginica): paired narrow basal leaves and a low spray of white-to-pink 5-petaled flowers with darker pink stripes (nectar guides), Mar through early May in zone 6a. The marble-sized corms ("fairy spuds") taste like sweet chestnut/potato when boiled — leaves and flowers also edible raw. CONSERVATION CAUTION: takes 7-10 years from seed to flower and harvesting the corm or pulling leaves kills the plant. Restrict harvest to truly abundant disturbed sites (e.g. lawn colonies, logging-track edges) where you can confirm a dense thousand-plant stand and remove well under 1% — never touch a woodland population unless you have explicit landowner consent and verified extreme abundance. Default: enjoy in place. Easy to confuse with the equally edible Carolina spring beauty (C. caroliniana, wider leaves); look-alike confusion risk low.'
  },
  {
    name: 'Cut-leaf toothwort',
    members: ['Cardamine concatenata'],
    anchor_zone: '6a', anchor_peak: 110, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Cut-leaf toothwort (Eat The Weeds + Forager Chef + USDA Plant Profile)',
    source_url: 'https://www.eattheweeds.com/bittercress-and-kissing-crucifer-cousins/',
    summary: 'Cut-leaf toothwort (Cardamine concatenata): spring ephemeral with a whorl of 3 deeply-cut, sharply-toothed palmate leaves below a cluster of 4-petaled white-to-pinkish mustard-family flowers, Apr through early May in zone 6a. Segmented (toothed) underground rhizome — the "tooth" of toothwort — peels to a crisp peppery flesh tasting strongly of horseradish or wasabi. Best use: grate fresh into vinegar or sour cream as a horseradish substitute; flavor fades within hours (allyl-isothiocyanate is volatile, exactly like commercial horseradish). Whole plant is edible mustard-family greens. Iroquois ate it raw with salt and used the mashed root medicinally. CONSERVATION: woodland spring ephemeral — harvest only from abundant colonies (>100 plants) and take a small segment of the rhizome chain so the plant regrows; never pull the entire rootstock.'
  },

  // ── Tier 5: herbal / minor ──

  {
    name: 'Wild bergamot (flowers)',
    members: ['Monarda fistulosa'],
    anchor_zone: '6a', anchor_peak: 196, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'flower_harvest',
    source_name: 'Wild bergamot (USDA Plant Profile)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=MOFI',
    summary: 'Wild bergamot: Jun-Aug bloom. Tea, tincture, thyme-like seasoning.'
  },
  {
    name: 'Common blue violet (flowers)',
    members: ['Viola sororia'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'flower_harvest',
    source_name: 'Common blue violet (Forager Chef + Eat The Weeds + USDA Plant Profile)',
    source_url: 'https://foragerchef.com/violets/',
    summary: 'Common blue violet (Viola sororia): heart-shaped basal leaves and five-petal violet/purple flowers on separate leafless stalks (no aerial stem) — distinguishes from look-alike yellow-flowered Lesser Celandine (Ficaria verna, toxic raw) which has a similar leaf shape but yellow buttercup flowers and tuberous roots. Late-Mar through May bloom; peak late Apr in zone 6a. Flowers: candied violets (egg-white + sugar) for cake decoration, lavender-blue violet syrup that turns pink with lemon juice (acid-base color shift), wine, vinegar. Leaves: cook like spinach or use raw in salads — high in vitamin C and natural mucilage that thickens soups. Roots are NOT edible (emetic, mild saponins). Avoid yellow-flowered violets if uncertain — some contain higher saponin loads.'
  },
  {
    name: 'Catnip (leaves)',
    members: ['Nepeta cataria'],
    // Anchor shifted Jul 1 → Jul 16 (peak 182 → 197) so the Jun-Aug
    // window cited in the summary actually matches — was starting
    // mid-May with the prior peak.
    anchor_zone: '6a', anchor_peak: 197, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Catnip (Eat The Weeds + Wisconsin Hort Extension + NC State Extension)',
    source_url: 'https://www.eattheweeds.com/tag/catnip/',
    summary: 'Catnip (Nepeta cataria): mint-family herb with square stem, grey-green triangular toothed leaves with downy white underside, and small white flowers spotted purple in terminal whorls. Strong minty-musky smell when crushed; field-ID by the square stem + scent + downy leaf. Harvest flowering tops Jun through Aug in 6a — nepetalactone (the active compound) peaks at full bloom; leaves alone (before bloom) usable but weaker. Uses: mild sedative tea for sleep, anxiety, indigestion, infant colic (low-dose). Candied flowers, salad herb in Europe, mosquito-repellent rub (nepetalactone is ~10x stronger than DEET as a mosquito deterrent, briefly). Famously psychoactive to ~2/3 of cats (genetic). PREGNANCY CAUTION: traditionally used as an emmenagogue (period-bringer) — avoid in pregnancy. Large amounts are emetic in humans.'
  },
  {
    name: 'Canada goldenrod (flowers)',
    members: ['Solidago canadensis'],
    anchor_zone: '6a', anchor_peak: 244, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'flower_harvest',
    source_name: 'Canada goldenrod (USDA Plant Profile)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=SOCA6',
    summary: 'Canada goldenrod: Aug-Oct bright yellow tops. Tea / tincture; pollinator favorite.'
  },
  {
    name: 'Pin cherry',
    members: ['Prunus pensylvanica'],
    anchor_zone: '6a', anchor_peak: 213, shift_per_half_zone: -4, half_window: 21,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    stage: 'ripe',
    source_name: 'Pin cherry (USDA Silvics)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/prunus/pensylvanica.htm',
    summary: 'Pin cherry: small tart red cherries Jul-Aug. Mostly used for jelly / wine.'
  },
  {
    name: 'Lobster mushroom',
    members: ['Hypomyces lactifluorum'],
    anchor_zone: '6a', anchor_peak: 237, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'Lobster mushroom (Mushroom Expert)',
    source_url: 'https://www.mushroomexpert.com/hypomyces_lactifluorum.html',
    summary: 'Lobster mushroom: Aug-Sep. Parasitic fungus on Russula/Lactarius hosts; firm, seafood-like flavor.',
    regional_anchors: [
      { zones: ['4a','4b','5a','5b','6a'], source: 'Northeast Mycological Federation', url: 'https://newenglandmushrooms.com/', summary: 'NE: Aug-early Oct flush, conifer + hardwood mixed forests.', peak_doy: 237, half_window: 28 },
      { zones: ['7a','7b','8a'], source: 'Pacific NW Key Council', url: 'http://www.svims.ca/council/', summary: 'PNW: Aug-Oct, more abundant under Douglas fir.', peak_doy: 250, half_window: 30 }
    ]
  },
  {
    name: 'Wapato (rhizome)',
    members: ['Sagittaria latifolia'],
    anchor_zone: '6a', anchor_peak: 288, shift_per_half_zone: -2, half_window: 35,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'root_dig',
    source_name: 'Wapato (USDA Plant Profile + indigenous food traditions)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=SALA2',
    summary: 'Wapato: late-fall to early-spring tuber harvest. Walnut-sized starchy tubers.'
  },
  {
    name: 'Bunchberry',
    members: ['Cornus canadensis'],
    anchor_zone: '6a', anchor_peak: 237, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a'],
    stage: 'ripe',
    source_name: 'Bunchberry (USDA Plant Profile)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=COCA13',
    summary: 'Bunchberry: northern boreal groundcover, Aug-Sep. Mild flavor, used in northern Indigenous traditions.'
  },
  {
    name: 'Partridgeberry',
    members: ['Mitchella repens'],
    anchor_zone: '6a', anchor_peak: 258, shift_per_half_zone: -3, half_window: 60,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'ripe',
    source_name: 'Partridgeberry (USDA Plant Profile)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=MIRE',
    summary: 'Partridgeberry: trailing evergreen with persistent paired red berries. Available Sep through following spring.'
  },
  {
    name: 'Flowering dogwood',
    members: ['Cornus florida'],
    anchor_zone: '6a', anchor_peak: 258, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Flowering dogwood (USDA Silvics)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/cornus/florida.htm',
    summary: 'Flowering dogwood: red drupes Sep-Oct, edible cooked only (bitter raw). Minor culinary forage.'
  },

  // Apple (Malus domestica) — heat-driven, mild gradient. Cited
  // evidence anchors at "Sep-Oct" peak; iNat shows ~3-week earlier
  // ripening in 8a-9a (warm-zone summer cultivars). Anchor 6a peak
  // Sep 12 (DOY 255), mild -3 d/half-zone.
  {
    name: 'Apple',
    members: ['Malus domestica'],
    anchor_zone: '6a', anchor_peak: 255, shift_per_half_zone: -3, half_window: 35,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b'],
    stage: 'ripe',
    source_name: 'Apple (Cornell CE + UMass Extension + iNat-empirical fit)',
    source_url: 'https://gardening.cals.cornell.edu/plants/apple/',
    summary: 'Apple (Malus domestica): heat-driven late-summer to fall ripe. Anchor 6a peak Sep 12, mild -3 d/half-zone. Wide ±35d window reflects cultivar variability.'
  },

  // Pomegranate (Punica granatum) — Mediterranean / Mediterranean-like
  // climate. Heat-driven late-fall ripening. Anchor 9a peak Oct 1
  // (DOY 274), mild -3 d/half-zone.
  {
    name: 'Pomegranate',
    members: ['Punica granatum'],
    anchor_zone: '9a', anchor_peak: 274, shift_per_half_zone: -3, half_window: 28,
    target_zones: ['7b','8a','8b','9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Pomegranate (UC ANR + Mediterranean cultivar timing)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8576',
    summary: 'Pomegranate (Punica granatum): heat-driven late-fall ripe. Best in zones 7b-10b; anchor 9a peak Oct 1.'
  },

  // ── Cultivar citation batch (2026-05-10) ──

  // Citrus complex — sweet orange, lemon, mandarin, grapefruit, sour
  // orange. All subtropical, winter-ripening. Peak Dec-Mar in zone
  // 9b-10a (CA Central Valley / FL). Wide window reflects cultivar
  // spread. Mild heat-shift (warmer slightly later for some, earlier
  // for others — averages to nearly flat in the cultivar range).
  {
    name: 'Sweet orange (early-year)',
    members: ['Citrus sinensis'],
    anchor_zone: '9b', anchor_peak: 30, shift_per_half_zone: -2, half_window: 60,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Sweet orange (UC ANR + Florida Citrus Industry)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8197',
    summary: 'Sweet orange (Citrus sinensis) Jan-Mar: peak Jan-Feb in CA Central Valley (zone 9b). Pair with the Nov-Dec late-year row for full navel cultivar coverage.'
  },
  {
    name: 'Sweet orange (late-year)',
    members: ['Citrus sinensis'],
    anchor_zone: '9b', anchor_peak: 335, shift_per_half_zone: -2, half_window: 30,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Sweet orange late-year (UC ANR + Florida Citrus Industry)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8197',
    summary: 'Sweet orange Nov-Dec: navel cultivars start in November in CA/FL. Pair with the Jan-Mar early-year row.'
  },
  {
    name: 'Lemon (early-year)',
    members: ['Citrus limon'],
    anchor_zone: '9b', anchor_peak: 1, shift_per_half_zone: 0, half_window: 90,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Lemon (UC ANR + CRFG)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8204',
    summary: 'Lemon (Citrus limon) Jan-Mar: essentially year-round in subtropical zones, peak winter. Pair with Oct-Dec late-year row.'
  },
  {
    name: 'Lemon (late-year)',
    members: ['Citrus limon'],
    anchor_zone: '9b', anchor_peak: 335, shift_per_half_zone: 0, half_window: 60,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Lemon late-year (UC ANR + CRFG)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8204',
    summary: 'Lemon Oct-Dec: continuation of the year-round cropping cycle in CA/FL.'
  },
  {
    name: 'Mandarin orange (late-year)',
    members: ['Citrus reticulata'],
    anchor_zone: '9b', anchor_peak: 350, shift_per_half_zone: -2, half_window: 45,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Mandarin orange (UC ANR + Florida Citrus)',
    source_url: 'https://homeorchard.ucanr.edu/Mandarin/',
    summary: 'Mandarin (Citrus reticulata) Nov-Dec: Satsuma + clementine cultivars start in late Oct. Pair with Jan-Mar early-year row.'
  },
  {
    name: 'Mandarin orange (early-year)',
    members: ['Citrus reticulata'],
    anchor_zone: '9b', anchor_peak: 30, shift_per_half_zone: -2, half_window: 45,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Mandarin orange early-year (UC ANR + Florida Citrus)',
    source_url: 'https://homeorchard.ucanr.edu/Mandarin/',
    summary: 'Mandarin Jan-Mar: tail end of the Nov-Mar cropping season.'
  },
  {
    name: 'Grapefruit (early-year)',
    members: ['Citrus paradisi'],
    anchor_zone: '9b', anchor_peak: 50, shift_per_half_zone: -2, half_window: 90,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Grapefruit (UC ANR + Florida Citrus)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8201',
    summary: 'Grapefruit (Citrus paradisi) Jan-May: peak Feb-Mar. Widened half_window to 90 covers Marsh / Ruby Red / Star Ruby cultivar spread. Pair with Oct-Dec late-year row.'
  },
  {
    name: 'Grapefruit (late-year)',
    members: ['Citrus paradisi'],
    anchor_zone: '9b', anchor_peak: 319, shift_per_half_zone: -2, half_window: 30,
    target_zones: ['8b','9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Grapefruit late-year (UC ANR + Florida Citrus)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=8201',
    summary: 'Grapefruit Oct-Dec: early cultivar harvest begins mid-October in CA/FL.'
  },

  // Plums (cultivated)
  {
    name: 'European plum',
    members: ['Prunus domestica'],
    anchor_zone: '6a', anchor_peak: 240, shift_per_half_zone: -4, half_window: 28,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'European plum (Cornell CE + UC ANR)',
    source_url: 'https://gardening.cals.cornell.edu/plants/plum/',
    summary: 'European plum (Prunus domestica): heat-driven, peak late-Aug to mid-Sep in zone 6a. Cultivar range Aug-Oct.'
  },
  {
    name: 'Japanese plum',
    members: ['Prunus salicina'],
    anchor_zone: '7a', anchor_peak: 207, shift_per_half_zone: -5, half_window: 28,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Japanese plum (UC ANR + Cornell CE)',
    source_url: 'https://homeorchard.ucanr.edu/General-information/Stone-fruits/',
    summary: 'Japanese plum (Prunus salicina): heat-driven, ripens Jun-Aug. Earlier than European plum; Santa Rosa peaks late June in CA.'
  },
  {
    name: 'Sour cherry',
    members: ['Prunus cerasus'],
    anchor_zone: '6a', anchor_peak: 196, shift_per_half_zone: -4, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'ripe',
    source_name: 'Sour cherry (Cornell CE + Michigan State Extension)',
    source_url: 'https://gardening.cals.cornell.edu/plants/cherry/',
    summary: 'Sour cherry (Prunus cerasus): heat-driven, peak Jul in zone 6a (Cornell). Earlier than sweet cherry by 1-2 weeks; Montmorency is the dominant cultivar in eastern NA.'
  },

  // Subtropical / specialty cultivars
  // Avocado has cultivar windows that genuinely span the whole calendar
  // (Hass Mar-Sep, Bacon Nov-Mar, Fuerte Nov-Apr, Reed Jun-Oct). Two
  // rows: early-year + late-year so the published windows cover the
  // full Hass+Bacon+Fuerte+Reed cultivar spread instead of just Jan-Jun.
  {
    name: 'Avocado (early-year)',
    members: ['Persea americana'],
    anchor_zone: '9b', anchor_peak: 91, shift_per_half_zone: -2, half_window: 90,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Avocado (UC ANR + California Avocado Commission)',
    source_url: 'https://homeorchard.ucanr.edu/Avocados/',
    summary: 'Avocado (Persea americana) Jan-Jun: Hass peak Mar-May, Bacon/Fuerte Jan-Mar. Pair with late-year row.'
  },
  {
    name: 'Avocado (late-year)',
    members: ['Persea americana'],
    anchor_zone: '9b', anchor_peak: 244, shift_per_half_zone: -2, half_window: 90,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Avocado late-year (UC ANR + California Avocado Commission)',
    source_url: 'https://homeorchard.ucanr.edu/Avocados/',
    summary: 'Avocado Jul-Dec: Hass tail (Jul-Sep), Reed (Jun-Oct), Bacon/Fuerte start (Nov-Dec). Closes the cultivar-spread gap.'
  },
  {
    name: 'Kiwifruit',
    members: ['Actinidia deliciosa'],
    anchor_zone: '8a', anchor_peak: 288, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Kiwifruit (UC ANR + CRFG)',
    source_url: 'https://homeorchard.ucanr.edu/Kiwifruit/',
    summary: 'Kiwifruit (Actinidia deliciosa): heat-driven late-fall ripe (Oct-Nov in CA). Best in zones 7a-10a; needs long growing season.'
  },
  {
    name: 'Wine grape',
    members: ['Vitis vinifera'],
    anchor_zone: '7b', anchor_peak: 258, shift_per_half_zone: -5, half_window: 28,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Wine grape (UC Davis Viticulture + Cornell CE)',
    source_url: 'https://iv.ucdavis.edu/',
    summary: 'Wine grape (Vitis vinifera): heat-driven, peak Sep in zone 7b (Sonoma/Napa range). Earlier in warmer zones; cultivar variation 4-6 weeks within a zone.'
  },

  // Black cherry (Prunus serotina) — heat-driven wild forest-edge
  // cherry. Empirical iNat slope -8 d/half-zone (n=11). Anchor 7a
  // peak Jul 8. Note: P. serotina is foraged from wild trees, NOT
  // sold as u-pick (those are P. avium / P. cerasus, separate
  // entries). Added regional citations across the zone range to
  // diversify the evidence beyond a single iNat anchor.
  {
    name: 'Black cherry',
    members: ['Prunus serotina'],
    anchor_zone: '7a',
    anchor_peak: 189,           // Jul 8
    shift_per_half_zone: -8,    // empirical iNat -8.0
    half_window: 21,
    target_zones: ['3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Black cherry (iNat-empirical heat-shift fit)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/prunus/serotina.htm',
    summary: 'Black cherry (Prunus serotina): wild forest-edge cherry, heat-driven late-summer ripe. iNat slope -8 d/half-zone (n=11); anchor 7a peak Jul 8.',
    regional_anchors: [
      {
        zones: ['3b','4a','4b','5a','5b'],
        source: 'Minnesota Wildflowers + Northern Woodlands (cold-zone wild cherry)',
        url: 'https://www.minnesotawildflowers.info/tree/black-cherry',
        summary: 'Cold-zone wild black cherry (MN/VT/NH): peak harvest mid-August in zones 4-5. Common in forest edges and old fields.',
        peak_doy: 227, half_window: 21
      },
      {
        zones: ['5b','6a','6b','7a'],
        source: 'Cornell CE + USDA Silvics (mid-Atlantic / Northeast)',
        url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/prunus/serotina.htm',
        summary: 'USDA Silvics + Cornell: black cherry ripens late July to early August across the central NA range. Most common foraging zone (NY/PA/OH/MI).',
        peak_doy: 210, half_window: 21
      },
      {
        zones: ['7a','7b','8a'],
        source: 'NC State Extension + Eat The Weeds (Carolinas / SE)',
        url: 'https://content.ces.ncsu.edu/',
        summary: 'Mid-Atlantic / Carolinas: wild black cherry ripens mid-June to mid-July. Earlier than northern range; commonly bird-stripped quickly so timing window matters.',
        peak_doy: 175, half_window: 21
      },
      {
        zones: ['8a','8b','9a'],
        source: 'Foraging Texas + Eat The Weeds Florida',
        url: 'https://www.foragingtexas.com/black-cherry',
        summary: 'Deep South / Texas: wild black cherry ripens late May to late June; earliest in the species range. Subtropical population edge.',
        peak_doy: 158, half_window: 21
      }
    ]
  }
];

(async () => {
  let totalUpdated = 0, totalInserted = 0;
  for (const cx of COMPLEXES) {
    console.log(`\n=== ${cx.name} ===`);
    const anchorNum = ZONE_NUM[cx.anchor_zone];
    if (anchorNum == null) {
      console.error(`  bad anchor_zone ${cx.anchor_zone}`);
      continue;
    }
    const stage = cx.stage ?? 'ripe';
    const evEntry = {
      source: cx.source_name,
      url: cx.source_url,
      consulted_at: '2026-05-10T00:00:00Z',
      summary: cx.summary,
      supports: {
        start_doy: Math.max(1, cx.anchor_peak - cx.half_window),
        end_doy: Math.min(366, cx.anchor_peak + cx.half_window),
        peak_doy: cx.anchor_peak
      }
    };
    const note = `${cx.name} unified harvest curve. ${cx.summary}`;

    for (const sci of cx.members) {
      const sp = await sql`select id, common_name from species where scientific_name = ${sci}`;
      if (sp.length === 0) continue;
      const speciesId = sp[0].id;
      console.log(`  ${sp[0].common_name} (${sci}):`);

      for (const zoneCode of cx.target_zones) {
        const zone = await sql`select id from climate_zones where code = ${zoneCode}`;
        if (zone.length === 0) continue;
        const zoneNum = ZONE_NUM[zoneCode];
        if (zoneNum == null) continue;
        const peak = Math.max(1, Math.min(366,
          cx.anchor_peak + (zoneNum - anchorNum) * cx.shift_per_half_zone
        ));
        const start = Math.max(1, peak - cx.half_window);
        const end = Math.min(366, peak + cx.half_window);

        const existing = await sql`
          select id, coalesce(evidence, '[]'::jsonb) as evidence
            from species_fruiting_windows
           where species_id = ${speciesId}
             and climate_zone_id = ${zone[0].id}
             and stage = ${stage}::public.stage`;

        const ev = existing.length > 0 && Array.isArray(existing[0].evidence) ? existing[0].evidence : [];
        let newEv = ev.some(e => e?.source === evEntry.source) ? ev : ev.concat([evEntry]);

        // Per-zone-band regional anchor citations: attach each anchor
        // whose zones include this zone, so the viewer surfaces the
        // actual zone-specific source justifying the projection.
        for (const anchor of (cx.regional_anchors ?? [])) {
          if (!anchor.zones.includes(zoneCode)) continue;
          if (newEv.some(e => e?.source === anchor.source)) continue;
          const hw = anchor.half_window ?? cx.half_window;
          newEv = newEv.concat([{
            source: anchor.source,
            url: anchor.url,
            consulted_at: '2026-05-10T00:00:00Z',
            summary: anchor.summary,
            supports: {
              start_doy: Math.max(1, anchor.peak_doy - hw),
              end_doy: Math.min(366, anchor.peak_doy + hw),
              peak_doy: anchor.peak_doy
            }
          }]);
        }

        if (existing.length === 0) {
          await sql`
            insert into species_fruiting_windows
              (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
            values
              (${speciesId}, ${zone[0].id}, ${stage}::public.stage,
               ${start}, ${end}, ${peak},
               'regional_guide'::public.window_confidence,
               ${note},
               ${sql.json(newEv)})`;
          console.log(`    ${zoneCode}: INSERT ${start}-${end}/peak ${peak}`);
          totalInserted++;
        } else {
          await sql`
            update species_fruiting_windows
               set start_doy = ${start}, end_doy = ${end}, peak_doy = ${peak},
                   confidence = 'regional_guide'::public.window_confidence,
                   notes = ${note},
                   evidence = ${sql.json(newEv)},
                   updated_at = now()
             where id = ${existing[0].id}`;
          console.log(`    ${zoneCode}: UPDATE → ${start}-${end}/peak ${peak}`);
          totalUpdated++;
        }
      }
    }
  }
  console.log(`\nTotal: ${totalInserted} inserted, ${totalUpdated} updated.`);

  // Emit a static JSON with complex-membership info so the calibration
  // viewer can show "this species is part of {complex}; {N}/{M} members
  // confirmed" notes.
  const path = require('node:path');
  const memberToComplex = {};
  for (const cx of COMPLEXES) {
    for (const sci of cx.members) {
      if (!memberToComplex[sci]) memberToComplex[sci] = [];
      memberToComplex[sci].push({ name: cx.name, members: cx.members, stage: cx.stage ?? 'ripe' });
    }
  }
  const outPath = path.join('/Users/jk/Dropbox/Claude/forager/static/species-complexes.json');
  fs.writeFileSync(outPath, JSON.stringify(memberToComplex, null, 2));
  console.log(`Wrote complex-membership JSON: ${outPath} (${Object.keys(memberToComplex).length} species)`);

  await sql.end();
})();
