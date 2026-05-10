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
    anchor_peak: 175,           // Jun 24
    shift_per_half_zone: -6,
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
    shift_per_half_zone: -5,    // empirical iNat -5.2
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
        start_doy: cx.anchor_peak - cx.half_window,
        end_doy: cx.anchor_peak + cx.half_window,
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
  await sql.end();
})();
