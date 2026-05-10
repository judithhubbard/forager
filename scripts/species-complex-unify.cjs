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
  // Hazelnuts — wild hazelnuts (American + beaked) drop Aug-Sep before
  // first frost. iNat is wrong-stage (developing nuts on tree, not
  // drops), so the empirical slope from iNat is unreliable; -7 retained
  // as a defensible heat-driven default until cited zone-specific
  // harvest evidence accumulates.
  {
    name: 'Corylus (hazelnut) complex',
    members: ['Corylus americana', 'Corylus cornuta', 'Corylus sp.'],
    anchor_zone: '6a',
    anchor_peak: 240,           // Aug 27
    shift_per_half_zone: -7,    // heat-driven; iNat wrong-stage so empirical fit unreliable
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'ripe',
    source_name: 'Corylus complex (USDA Silvics + extension services)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/corylus/americana.htm',
    summary: 'Corylus complex consensus: wild hazelnuts (C. americana, C. cornuta) drop Aug-Sep before first frost across their range. Heat-driven harvest, anchor zone 6a peak Aug 27 (DOY 240).'
  },

  // Serviceberries — Amelanchier complex hybridizes freely; foragers
  // and botanists treat them as a single juneberry/serviceberry group.
  // Empirical iNat slope -2.8 d/half-zone (n=10); rounded to -4 to
  // match Tyrant Farms (zone 7b) "late May to mid-June" citation.
  {
    name: 'Amelanchier (serviceberry) complex',
    members: ['Amelanchier arborea', 'Amelanchier canadensis', 'Amelanchier laevis', 'Amelanchier sp.'],
    anchor_zone: '6a',
    anchor_peak: 167,           // Jun 16
    shift_per_half_zone: -4,    // empirical iNat -2.8; -4 fits cited 7b evidence
    half_window: 18,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
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
  // peak in zone 6a is mid-September (~Sep 15 / DOY 258). Empirical
  // iNat slope -10.9 d/half-zone (n=8) — pawpaw has a *steeper*
  // gradient than typical heat-driven defaults (late-season fruit
  // ripening gated on cumulative summer GDD).
  {
    name: 'Pawpaw',
    members: ['Asimina triloba'],
    anchor_zone: '6a',
    anchor_peak: 258,           // Sep 15
    shift_per_half_zone: -10,   // empirical iNat -10.9 (steep)
    half_window: 21,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Pawpaw (KSU Pawpaw Program + Ohio State Extension)',
    source_url: 'https://www.kysu.edu/academics/college-acs/school-of-aens/pawpaw/',
    summary: 'Pawpaw (Asimina triloba): heat-driven harvest, peak in zone 6a mid-September. iNat-empirical gradient is steep (-10 d/half-zone) reflecting GDD-gated late-season fruit.'
  },

  // Allegheny chinkapin — heat-driven (NOT frost-driven; cited sources
  // describe Aug-Sep harvest with no requirement for first frost).
  // Empirical iNat slope -2.6 d/half-zone (n=6); chinkapin is fairly
  // latitude-tolerant within its range. Anchored at zone 7a peak Sep 29.
  {
    name: 'Allegheny chinkapin',
    members: ['Castanea pumila'],
    anchor_zone: '7a',
    anchor_peak: 272,           // Sep 29
    shift_per_half_zone: -3,    // empirical iNat -2.6
    half_window: 21,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'ripe',
    source_name: 'Allegheny chinkapin (Eat The Weeds + USDA Silvics + NC State Extension)',
    source_url: 'https://www.eattheweeds.com/chinkapin-edible-and-easy-to-find-2/',
    summary: 'Allegheny chinkapin (Castanea pumila): heat-driven Aug-Sep harvest across the species range. Anchor 7a peak Sep 29; iNat-empirical shallow gradient (-3 d/half-zone).'
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
    source_name: 'Common plantain leaves (foraging consensus)',
    source_url: 'https://practicalselfreliance.com/foraging-plantain/',
    summary: 'Common plantain (Plantago major) leaves: young tender leaves preferred (mid-Apr to early-Jun in 6a); becomes tougher / stringier through summer but still edible cooked. The seed-head stage is a separate ripe-stage row (peak Sep).'
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

  // Ribes (currant) complex — black currant, red currant, gooseberries.
  // Heat-driven early-summer fruit (Jun-Jul). Strong commercial crop
  // with well-documented timing. Anchor 6a peak Jul 14 (DOY 195),
  // shift -5 (matches mulberry / similar early-summer berries).
  {
    name: 'Ribes (currant) complex',
    members: ['Ribes nigrum', 'Ribes rubrum', 'Ribes uva-crispa', 'Ribes sp.'],
    anchor_zone: '6a',
    anchor_peak: 195,           // Jul 14
    shift_per_half_zone: -5,
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Ribes complex (Cornell CE + commercial currant timing)',
    source_url: 'https://gardening.cals.cornell.edu/plants/currant-gooseberry/',
    summary: 'Ribes complex (currants + gooseberries): heat-driven early-summer fruit. Anchor 6a peak Jul 14, shift -5 d/half-zone matching similar early-summer berries.'
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

  // American plum (Prunus americana) — heat-driven, very mild gradient.
  // iNat slope -1 (essentially flat). User flagged "do not apply
  // monotonic behavior" — the curve is genuinely flat across zones.
  // Anchor 6a peak Aug 11 (DOY 223), shift -1.
  {
    name: 'American plum',
    members: ['Prunus americana'],
    anchor_zone: '6a',
    anchor_peak: 223,           // Aug 11
    shift_per_half_zone: -1,    // empirical iNat ~-1; nearly flat
    half_window: 18,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'American plum (Minnesota Wildflowers + USDA Silvics)',
    source_url: 'https://www.minnesotawildflowers.info/shrub/wild-plum',
    summary: 'American plum (Prunus americana): heat-driven late-summer fruit with very mild cross-zone gradient (-1 d/half-zone). Curve is essentially flat — variability is within-zone, not across zones.'
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
    source_name: 'Dandelion leaves (foraging consensus)',
    source_url: 'https://practicalselfreliance.com/foraging-dandelion/',
    summary: 'Dandelion (Taraxacum officinale) leaves: tender spring leaves preferred (mid-Apr in 6a); becomes bitter post-flowering. Wide harvest window. Mild heat-driven gradient.'
  },

  // ── Per-user review-batch 2026-05-10 ──

  // Adam's needle (Yucca filamentosa) — edible flowers only. Native
  // SE US, naturalized further north. Blooms mid-summer (Jun-Jul);
  // flowers are sweet, used in salads or fritters. Heat-driven mild.
  {
    name: "Adam's needle (flowers)",
    members: ['Yucca filamentosa'],
    anchor_zone: '6a', anchor_peak: 182, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'flower_harvest',
    source_name: "Adam's needle (USDA Plant Profile + foraging guides)",
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=YUFI',
    summary: "Adam's needle (Yucca filamentosa): edible flowers Jun-Jul, sweet pea-like flavor. Bloom stalks 4-8 ft; pick individual flowers."
  },

  // Almond (Prunus dulcis) — commercial nut crop, dominant in CA (zones
  // 9-10). Hull-split / harvest Aug to mid-Sep depending on cultivar.
  // Anchor 9a peak Aug 25 (DOY 237), shift -7 (heat-driven, earlier in
  // warmest zones); narrow window since commercial harvest is well-
  // defined.
  {
    name: 'Almond',
    members: ['Prunus dulcis'],
    anchor_zone: '9a', anchor_peak: 237, shift_per_half_zone: -7, half_window: 21,
    target_zones: ['7b','8a','8b','9a','9b','10a','10b'],
    stage: 'ripe',
    source_name: 'Almond (UC ANR + Almond Board of California)',
    source_url: 'https://anrcatalog.ucanr.edu/Details.aspx?itemNo=3364',
    summary: 'Almond (Prunus dulcis): commercial harvest hull-split Aug to mid-Sep in CA Central Valley (zone 9). Cultivar variability spans ~3 weeks.'
  },

  // Cherimoya (Annona cherimola) — subtropical / tropical fruit. Peak
  // harvest Nov-May depending on cultivar; wide window. Anchor 10a peak
  // Jan 30 (DOY 30); use small mild shift since equatorial gradient is
  // microclimate-driven.
  {
    name: 'Cherimoya',
    members: ['Annona cherimola'],
    anchor_zone: '10a', anchor_peak: 30, shift_per_half_zone: -2, half_window: 90,
    target_zones: ['9a','9b','10a','10b','11a','11b'],
    stage: 'ripe',
    source_name: 'Cherimoya (UC ANR + California Rare Fruit Growers)',
    source_url: 'https://www.crfg.org/pubs/ff/cherimoya.html',
    summary: 'Cherimoya (Annona cherimola): subtropical evergreen, harvest Nov to May in coastal CA; wide window reflects cultivar spread.'
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
    summary: 'Chicken of the woods (Laetiporus sulphureus): bright orange shelf fungus on hardwoods (esp. oak). Peak flush Aug-Oct (zone 6a); occasional spring flush.'
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
    source_name: 'Cattail pollen (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Typha',
    summary: 'Cattail pollen: tap mature spike into a bag, shake out. Brief 1-2 week window in late June (zone 6a).'
  },
  {
    name: 'Cattail (fall rhizome)',
    members: ['Typha latifolia', 'Typha angustifolia'],
    anchor_zone: '6a', anchor_peak: 285, shift_per_half_zone: -2, half_window: 35,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a'],
    stage: 'root_dig',
    source_name: 'Cattail rhizome harvest (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Typha',
    summary: 'Cattail rhizome: starchy fall through early-spring food. Best after first frost when starch is concentrated.'
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
  {
    name: 'Wild strawberry (Fragaria) complex',
    members: ['Fragaria virginiana', 'Fragaria vesca'],
    anchor_zone: '6a', anchor_peak: 176, shift_per_half_zone: -4, half_window: 21,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Wild strawberry complex (USDA Silvics + foraging guides)',
    source_url: 'https://plants.usda.gov/home/plantProfile?symbol=FRVI',
    summary: 'Wild strawberry: Jun-Jul ripe across temperate NA. F. virginiana (meadows) and F. vesca (woodland) share harvest timing.'
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
    summary: 'Sweet/yellow birch sap: late-winter / early-spring tap. ~2 weeks after maple sap window closes; lower sugar yield (~100:1 ratio for syrup).'
  },

  // ── Tier 2: roadside greens ──

  {
    name: 'Wood sorrel (leaves)',
    members: ['Oxalis stricta'],
    anchor_zone: '6a', anchor_peak: 152, shift_per_half_zone: -2, half_window: 60,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b','9a','9b','10a'],
    stage: 'leaf',
    source_name: 'Wood sorrel (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Oxalis_stricta',
    summary: 'Wood sorrel leaves: tart-citrusy three-leaflet weed. Edible all growing season; small amounts due to oxalic acid.'
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
    source_name: 'Sheep sorrel (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Rumex_acetosella',
    summary: 'Sheep sorrel leaves: tart, lemony, distinctive arrow-shaped leaves. Best young; oxalic-acid caveat.'
  },
  {
    name: 'Mugwort (leaves)',
    members: ['Artemisia vulgaris'],
    anchor_zone: '6a', anchor_peak: 152, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Mugwort (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Artemisia_vulgaris',
    summary: 'Mugwort: bitter herb, harvest before flowering. Pregnancy contraindication (thujone).'
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

  // ── Tier 3: edible mushrooms ──

  {
    name: 'Common puffball',
    members: ['Lycoperdon perlatum'],
    anchor_zone: '6a', anchor_peak: 244, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Common puffball (Audubon mushroom guide + Mushroom Expert)',
    source_url: 'https://www.mushroomexpert.com/lycoperdon_perlatum.html',
    summary: 'Common puffball: Aug-Oct. Cut in half — pure white interior confirms (rules out toxic Amanita "egg" stage).'
  },
  {
    name: 'Giant puffball',
    members: ['Calvatia gigantea'],
    anchor_zone: '6a', anchor_peak: 258, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Giant puffball (Mushroom Expert + foraging guides)',
    source_url: 'https://www.mushroomexpert.com/calvatia_gigantea.html',
    summary: 'Giant puffball: late-Aug to early-Oct. Soccer-ball-sized; one mushroom can feed a family.'
  },
  {
    name: 'Black trumpet',
    members: ['Craterellus cornucopioides'],
    anchor_zone: '6a', anchor_peak: 227, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'mushroom_flush',
    source_name: 'Black trumpet (Mushroom Expert + Wild Mushrooms of NE)',
    source_url: 'https://www.mushroomexpert.com/craterellus_cornucopioides.html',
    summary: 'Black trumpet: Jul-Sep under hardwoods (oak/beech). Earthy, smoky flavor; dries beautifully.'
  },
  {
    name: 'Wood blewit',
    members: ['Lepista nuda'],
    anchor_zone: '6a', anchor_peak: 288, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'mushroom_flush',
    source_name: 'Wood blewit (Mushroom Expert)',
    source_url: 'https://www.mushroomexpert.com/lepista_nuda.html',
    summary: 'Wood blewit: late-fall mushroom (Oct-Dec), often after first frosts. Lavender coloring; spore print pinkish-buff.'
  },

  // ── Tier 4: spring ephemerals ──

  {
    name: 'Trout lily (leaves + corm)',
    members: ['Erythronium americanum'],
    anchor_zone: '6a', anchor_peak: 115, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Trout lily (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Erythronium_americanum',
    summary: 'Trout lily: spring ephemeral, Apr-May only. Forage sparingly; populations are slow-growing.'
  },
  {
    name: 'Spring beauty',
    members: ['Claytonia virginica'],
    anchor_zone: '6a', anchor_peak: 91, shift_per_half_zone: -3, half_window: 30,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Spring beauty (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Claytonia_virginica',
    summary: 'Spring beauty: Mar-May. Tubers ("fairy spuds") are sweet starchy potato-substitute; flowers and leaves edible too.'
  },
  {
    name: 'Cut-leaf toothwort',
    members: ['Cardamine concatenata'],
    anchor_zone: '6a', anchor_peak: 110, shift_per_half_zone: -3, half_window: 21,
    target_zones: ['4a','4b','5a','5b','6a','6b','7a','7b','8a'],
    stage: 'leaf',
    source_name: 'Cut-leaf toothwort (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Cardamine_concatenata',
    summary: 'Cut-leaf toothwort: spring ephemeral. Root tastes like horseradish (use fresh, flavor fades quickly).'
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
    source_name: 'Common blue violet (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Viola_sororia',
    summary: 'Common blue violet: Apr-May peak bloom. Flowers candied, syrup-ed; leaves salad-edible.'
  },
  {
    name: 'Catnip (leaves)',
    members: ['Nepeta cataria'],
    anchor_zone: '6a', anchor_peak: 182, shift_per_half_zone: -3, half_window: 45,
    target_zones: ['3a','3b','4a','4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'leaf',
    source_name: 'Catnip (foraging consensus)',
    source_url: 'https://en.wikipedia.org/wiki/Catnip',
    summary: 'Catnip: tea / sleep aid. Pick flowering tops Jun-Aug.'
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
    summary: 'Lobster mushroom: Aug-Sep. Parasitic fungus on Russula/Lactarius hosts; firm, seafood-like flavor.'
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

  // Black cherry (Prunus serotina) — heat-driven late-summer fruit.
  // Empirical iNat slope -8 d/half-zone (n=11). Anchor zone 7a peak
  // Jul 8 (DOY 189).
  {
    name: 'Black cherry',
    members: ['Prunus serotina'],
    anchor_zone: '7a',
    anchor_peak: 189,           // Jul 8
    shift_per_half_zone: -8,    // empirical iNat -8.0
    half_window: 21,
    target_zones: ['4b','5a','5b','6a','6b','7a','7b','8a','8b'],
    stage: 'ripe',
    source_name: 'Black cherry (iNat-empirical heat-shift fit)',
    source_url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/volume_2/prunus/serotina.htm',
    summary: 'Black cherry (Prunus serotina): heat-driven late-summer ripe. Empirical iNat slope -8 d/half-zone (n=11). Anchor zone 7a peak Jul 8.'
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
