// Generalize the beech frost-fix to all hardwood mast nut species.
//
// iNat Fruiting-annotated observations capture nuts visible on the
// tree (developing burrs / hulls), which start showing in summer —
// the wrong stage for foragers, who collect dropped nuts after first
// frost. Every cited silviculture / forager source converges on
// post-first-frost harvest for these species; iNat is consistently
// 6-10 weeks too early.
//
// This script:
//   1. Per (species, zone), sets peak_doy = first_frost + species_offset
//      and start/end = peak ± half_window
//   2. Sets confidence='regional_guide' (cited consensus, not iNat-empirical)
//   3. Adds a species-tailored note explaining the iNat caveat
//   4. iNat evidence stays on rows for spread visualization
//   5. Skips zones outside the frost-peak table (the species's plausible
//      range, capped at 8b)
//
// Idempotent — skips rows already at the computed values.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

// First-frost peaks per zone (DOY) — NOAA 1991-2020 climate normals
// for first 32°F frost. Hardwood mast nuts track first frost for
// dispersal; this table is the canonical anchor. Zones 10a+ rarely
// or never frost (capped at Dec 31 / DOY 365 for math); species
// outside their natural range in those zones still get a defensible
// late-fall value rather than being skipped.
const FROST_PEAKS = {
  '3a': 242, '3b': 248, '4a': 255, '4b': 262,
  '5a': 269, '5b': 276, '6a': 283, '6b': 290,
  '7a': 297, '7b': 305, '8a': 314, '8b': 324,
  '9a': 335, '9b': 349, '10a': 365
};

// Per-species harvest timing relative to first frost. Negative = drops
// before first frost; positive = drops after first frost. Half-window
// is days on each side of peak. Sources: USDA Forest Service Silvics
// of North America, regional foraging guides, university extension
// fact sheets.
const NUT_SPECIES = {
  // Beech — done by beech-frost-fix.cjs but harmless to re-apply
  'Fagus grandifolia':    { offset:   0, half_window: 20, common: 'American beech' },
  // American persimmon REMOVED: iNat shows ripe peak DOY ~270 (Sep 27)
  // in zone 7a with N=909, vs frost-driven prediction of 311 (Nov 7).
  // The folk "wait for first frost" wisdom is a quality-control
  // heuristic for non-experts (avoid astringent under-ripe fruit),
  // not actual ripening — native persimmons fall from the tree when
  // fully ripe, before first frost in most zones. Now handled by
  // species-complex-unify with iNat-empirical anchor.
  // 'Diospyros virginiana': handled by species-complex-unify
  // American cranberry REMOVED: iNat shows ripe red fruit in early
  // September across zones (peak DOY ~250) — the "after first frost"
  // tradition is about flavor (frost sweetens), not ripening. Now
  // handled by species-complex-unify with iNat-empirical anchor.
  // 'Vaccinium macrocarpon': handled by species-complex-unify
  // Chestnuts: drop before frost (Sept)
  'Castanea dentata':     { offset: -10, half_window: 20, common: 'American chestnut' },
  'Castanea mollissima':  { offset: -10, half_window: 20, common: 'Chinese chestnut' },
  'Castanea sativa':      { offset:  -7, half_window: 20, common: 'Sweet chestnut' },
  'Castanea sp.':         { offset: -10, half_window: 20, common: 'Chestnut (unspecified)' },
  // Chinkapin: REMOVED from frost-driven treatment. Cited sources
  // (Eat The Weeds Florida 9a, USDA Silvics, NC State, Wikipedia)
  // describe heat-driven Aug-Sep harvest across the species's range
  // with no requirement for first frost. Now handled by chinkapin-fix
  // (heat-driven anchor 7a peak Sep 29). Leaving the entry commented
  // here to document the change.
  // 'Castanea pumila':   { offset: -25, half_window: 18, common: 'Allegheny chinkapin' },
  // Oaks: at or just after first frost (acorn drop)
  'Quercus alba':         { offset:   0, half_window: 20, common: 'White oak' },
  'Quercus macrocarpa':   { offset:   0, half_window: 20, common: 'Bur oak' },
  // Hickories: at first frost (husks split)
  'Carya ovata':          { offset:   0, half_window: 20, common: 'Shagbark hickory' },
  'Carya laciniosa':      { offset:   0, half_window: 20, common: 'Shellbark hickory' },
  // Pecan: just after first frost, commercial harvest
  'Carya illinoinensis':  { offset:  +7, half_window: 22, common: 'Pecan' },
  // Walnuts: husks blacken before first frost
  'Juglans nigra':        { offset:  -7, half_window: 20, common: 'Black walnut' },
  'Juglans cinerea':      { offset:  -7, half_window: 20, common: 'Butternut' },
  'Juglans regia':        { offset:   0, half_window: 20, common: 'English walnut' },
  // Hazelnuts removed: heat-driven (drop Aug-Sep before frost),
  // handled by species-complex-unify with anchor 6a peak Aug 27.
  // 'Corylus americana': handled by species-complex-unify
  // 'Corylus cornuta':   handled by species-complex-unify
};

function noteFor(common, offset) {
  const tag = offset === 0 ? 'at first hard frost'
    : offset > 0 ? `${offset} days after first frost`
    : `${Math.abs(offset)} days before first frost`;
  return `Frost-driven harvest: ${common} drops ${tag}. ` +
    `Per-zone peak DOY anchored to NOAA first-frost climatology (1991-2020 normals); ` +
    `±${''} days for the harvest window. Cited consensus from USDA Forest Service Silvics + regional foraging sources. ` +
    `iNat Fruiting evidence is RETAINED on this row for spread visibility but EXCLUDED from the synthesized DOY: ` +
    `iNat observers tag developing nuts visible on the tree (summer), which is the developing stage, not the harvest stage.`;
}

(async () => {
  let totalUpdated = 0, totalSkipped = 0, totalOutOfRange = 0, totalNotInDB = 0;

  for (const [scientificName, cfg] of Object.entries(NUT_SPECIES)) {
    const sp = await sql`select id from species where scientific_name = ${scientificName}`;
    if (sp.length === 0) {
      console.log(`\n${cfg.common} (${scientificName}): not in DB, skipping`);
      totalNotInDB++;
      continue;
    }
    const speciesId = sp[0].id;

    const wins = await sql`
      select w.id, cz.code, w.start_doy, w.end_doy, w.peak_doy, w.confidence, w.notes
        from species_fruiting_windows w
        join climate_zones cz on cz.id = w.climate_zone_id
       where w.species_id = ${speciesId} and w.stage = 'ripe'
       order by cz.code`;

    if (wins.length === 0) {
      console.log(`\n${cfg.common} (${scientificName}): no ripe rows, skipping`);
      continue;
    }

    console.log(`\n${cfg.common} (${scientificName}) — offset ${cfg.offset >= 0 ? '+' : ''}${cfg.offset}d, half-window ±${cfg.half_window}d`);

    let updated = 0, skipped = 0, outOfRange = 0;
    for (const w of wins) {
      const frostPeak = FROST_PEAKS[w.code];
      if (frostPeak == null) {
        console.log(`  ${w.code}: out of frost-peak table (zone outside species range), leaving untouched`);
        outOfRange++;
        continue;
      }
      const peak = Math.min(366, frostPeak + cfg.offset);
      const start = Math.max(1, peak - cfg.half_window);
      const end = Math.min(366, peak + cfg.half_window);
      const note = `Frost-driven harvest: ${cfg.common} drops ${
        cfg.offset === 0 ? 'at first hard frost'
        : cfg.offset > 0 ? `${cfg.offset} days after first frost`
        : `${Math.abs(cfg.offset)} days before first frost`
      }. Per-zone peak DOY anchored to NOAA first-frost climatology (1991-2020 normals); ±${cfg.half_window} days for the harvest window. Cited consensus from USDA Forest Service Silvics + regional foraging sources. iNat Fruiting evidence is RETAINED on this row for spread visibility but EXCLUDED from the synthesized DOY: iNat observers tag developing nuts visible on the tree (summer), which is the developing stage, not the harvest stage.`;

      // Build the frost-driven citation evidence entry. Surfaces the
      // NOAA + USDA Silvics justification in the viewer's evidence
      // panel (was previously only visible in the notes column).
      const evRow = await sql`
        select coalesce(evidence, '[]'::jsonb) as evidence
          from species_fruiting_windows where id = ${w.id}`;
      const ev = Array.isArray(evRow[0]?.evidence) ? evRow[0].evidence : [];
      const citationSource = `Frost-driven harvest model (NOAA first-frost climatology + USDA Silvics)`;
      const citationEntry = {
        source: citationSource,
        url: 'https://www.srs.fs.usda.gov/pubs/misc/ag_654/',
        consulted_at: '2026-05-10T00:00:00Z',
        summary: `${cfg.common}: frost-driven harvest. Drops ${cfg.offset === 0 ? 'at first hard frost' : cfg.offset > 0 ? cfg.offset + ' days after first frost' : Math.abs(cfg.offset) + ' days before first frost'}. Per-zone peak DOY anchored to NOAA first-frost climatology (1991-2020 normals).`,
        supports: { start_doy: start, end_doy: end, peak_doy: peak }
      };
      const newEv = ev.some(e => e?.source === citationSource)
        ? ev.map(e => e?.source === citationSource ? citationEntry : e)
        : ev.concat([citationEntry]);

      if (w.start_doy === start && w.end_doy === end && w.peak_doy === peak &&
          w.confidence === 'regional_guide' && (w.notes ?? '').includes('Frost-driven harvest') &&
          ev.some(e => e?.source === citationSource)) {
        skipped++;
        continue;
      }

      await sql`
        update species_fruiting_windows
           set start_doy = ${start},
               end_doy = ${end},
               peak_doy = ${peak},
               confidence = 'regional_guide'::public.window_confidence,
               notes = ${note},
               evidence = ${sql.json(newEv)},
               updated_at = now()
         where id = ${w.id}`;
      console.log(`  ${w.code}: ${w.start_doy}-${w.end_doy}/peak ${w.peak_doy} → ${start}-${end}/peak ${peak}`);
      updated++;
    }
    console.log(`  → ${updated} updated, ${skipped} unchanged, ${outOfRange} out-of-range`);
    totalUpdated += updated; totalSkipped += skipped; totalOutOfRange += outOfRange;
  }

  console.log(`\n=== Total: ${totalUpdated} updated, ${totalSkipped} unchanged, ${totalOutOfRange} out-of-range, ${totalNotInDB} species not in DB ===`);

  if (totalUpdated > 0) {
    console.log('Refreshing zone-presence materialized view…');
    await sql`select public.refresh_species_zone_presence()`;
  }
  await sql.end();
})();
