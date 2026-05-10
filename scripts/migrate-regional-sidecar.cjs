// Migrate regional-windows.json sidecar entries into the
// species_fruiting_windows.evidence array.
//
// Each region (Seattle metro / Ottawa metro / Toronto metro /
// Philadelphia metro / California UCANR) has per-species ripe-stage
// (and sometimes flowering) windows declared in the JSON sidecar.
// These are real regional-observation sources but live outside the
// evidence array, so the rederive/smoothing/anchor analysis can't
// see them.
//
// This script:
//   1. For each (region, species, stage) entry in the JSON
//   2. Finds the species's existing row(s) for the listed zones
//   3. Appends an evidence entry with supports {start_doy, end_doy}
//   4. Idempotent on (zone, source_url) — re-runs add 0 entries
//   5. Doesn't create new rows; only augments existing ones
//
// After running, re-run rederive + smooth so the synthesized DOYs
// pick up the new regional anchors.

'use strict';

const fs = require('node:fs');
const env = fs.readFileSync('/Users/jk/Dropbox/Claude/forager/.env.local', 'utf8');
const SUPABASE_DB_URL = env.match(/SUPABASE_DB_URL=(.+)/)[1].trim();
const sql = require('/Users/jk/Dropbox/Claude/forager/node_modules/postgres')(
  SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined }
);

const SIDECAR_PATH = '/Users/jk/Dropbox/Claude/forager/src/lib/data/regional-windows.json';
const TIME_CONSULTED = '2026-05-09T00:00:00Z';

(async () => {
  const sidecar = JSON.parse(fs.readFileSync(SIDECAR_PATH, 'utf8'));
  let appended = 0, skipped = 0, noRow = 0, noStage = 0;

  for (const [regionName, region] of Object.entries(sidecar.regions)) {
    console.log(`\n=== ${regionName} (${region.zone_codes?.join(', ') ?? '?'}) ===`);
    for (const [scientificName, windows] of Object.entries(region.windows ?? {})) {
      const sp = await sql`select id, common_name from species where scientific_name = ${scientificName}`;
      if (sp.length === 0) {
        console.log(`  ! ${scientificName}: not in DB, skipping`);
        continue;
      }
      const speciesId = sp[0].id;

      for (const [stageName, win] of Object.entries(windows)) {
        if (stageName === 'notes') continue;
        if (!win || typeof win !== 'object') continue;
        if (win.start_doy == null || win.end_doy == null) continue;

        const stage = stageName === 'ripe' ? 'ripe'
          : stageName === 'flowering' ? 'flowering'
          : stageName;

        const evEntry = {
          source: `${regionName} (${region.source ?? ''})`.trim(),
          url: region.source_url ?? '',
          consulted_at: TIME_CONSULTED,
          summary: `${regionName} regional observation${region.source ? ' from ' + region.source : ''} (zones ${(region.zone_codes ?? []).join(', ')}): ${win.notes ?? `harvest DOY ${win.start_doy}-${win.end_doy}`}`,
          supports: {
            start_doy: win.start_doy,
            end_doy: win.end_doy,
            ...(win.peak_doy != null ? { peak_doy: win.peak_doy } : {})
          }
        };

        for (const zoneCode of (region.zone_codes ?? [])) {
          const zone = await sql`select id from climate_zones where code = ${zoneCode}`;
          if (zone.length === 0) continue;
          const zoneId = zone[0].id;

          const rows = await sql`
            select id, coalesce(evidence, '[]'::jsonb) as evidence
              from species_fruiting_windows
             where species_id = ${speciesId}
               and climate_zone_id = ${zoneId}
               and stage = ${stage}::public.stage`;
          if (rows.length === 0) {
            noRow++;
            continue;
          }
          const row = rows[0];
          const ev = Array.isArray(row.evidence) ? row.evidence : [];
          // Idempotent: skip if a Region-named source pointing at this URL
          // is already on the row.
          const already = ev.some(e =>
            e?.source === evEntry.source &&
            e?.url === evEntry.url &&
            e?.supports?.start_doy === evEntry.supports.start_doy &&
            e?.supports?.end_doy === evEntry.supports.end_doy
          );
          if (already) { skipped++; continue; }

          const updated = ev.concat([evEntry]);
          await sql`
            update species_fruiting_windows
               set evidence = ${sql.json(updated)},
                   updated_at = now()
             where id = ${row.id}`;
          appended++;
        }
        console.log(`  ${scientificName} (${sp[0].common_name}) ${stageName}: appended to ${region.zone_codes?.length ?? 0} zones`);
      }
    }
  }

  console.log(`\n=== Summary: ${appended} evidence appended, ${skipped} already cited, ${noRow} no matching row, ${noStage} stage mismatch ===`);
  await sql.end();
})();
