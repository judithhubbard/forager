// Harvest-window coverage audit. For each USDA climate zone, count:
//   - pins in that zone (latent demand from imports)
//   - species visible in that zone (the catalog's relevant subset)
//   - species WITH at least one fruiting window for that zone
//   - per interest_group: pins, species count, covered species, gap
//
// Output drives the prioritization map: where does manual or
// automated curation buy the most user-impact-per-row?

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  // ---- Step 1: pins per climate zone ----
  console.log('=== Pins per USDA climate zone (latent user demand) ===');
  const zonePins = await sql`
    select cz.code as zone, count(*)::int as n
      from public.pins p
      join public.climate_zones cz on cz.id = p.climate_zone_id
     where p.visibility = 'public'
     group by cz.code
     order by n desc
  `;
  for (const r of zonePins) {
    console.log(`  ${r.zone.padEnd(4)}  ${r.n.toLocaleString().padStart(8)} pins`);
  }
  // Pins with no climate zone (probably outside USA — Edmonton etc.
  // since the climate_zones table only seeds USA zones).
  const unzoned = await sql`
    select count(*)::int as n
      from public.pins p
     where p.visibility = 'public' and p.climate_zone_id is null
  `;
  console.log(`  ---  ${unzoned[0].n.toLocaleString().padStart(8)} pins outside USDA zone polygons`);

  // ---- Step 2: window coverage per zone ----
  console.log('\n=== Window-row coverage per zone (species with ≥1 window) ===');
  const cov = await sql`
    select cz.code as zone,
           count(distinct sfw.species_id)::int as covered_species,
           count(*)::int as total_window_rows
      from public.species_fruiting_windows sfw
      join public.climate_zones cz on cz.id = sfw.climate_zone_id
     group by cz.code
     order by cz.code
  `;
  for (const r of cov) {
    console.log(`  ${r.zone.padEnd(4)}  ${String(r.covered_species).padStart(4)} species covered  /  ${r.total_window_rows} window rows`);
  }
  if (cov.length === 0) console.log('  (no rows in species_fruiting_windows yet for any zone)');

  // ---- Step 3: zone × interest_group impact map ----
  // For each (zone, interest_group): pins in zone (whose species is
  // tagged that group), count of distinct species, how many have any
  // window in that zone. Highlights the biggest unfilled cells.
  console.log('\n=== Top zone × interest-group cells by latent pins ===');
  const cells = await sql`
    with pin_zg as (
      select cz.code as zone, t as interest_group, p.id as pin_id, p.species_id
        from public.pins p
        join public.climate_zones cz on cz.id = p.climate_zone_id
        join public.species s on s.id = p.species_id
       cross join lateral unnest(coalesce(s.interest_tags, '{}'::text[])) t
       where p.visibility = 'public'
    ),
    cells as (
      select zone, interest_group,
             count(distinct pin_id)::int as pins,
             count(distinct species_id)::int as species_in_cell
        from pin_zg
       group by zone, interest_group
    ),
    covered as (
      select cz.code as zone,
             t as interest_group,
             count(distinct sfw.species_id)::int as covered_species
        from public.species_fruiting_windows sfw
        join public.climate_zones cz on cz.id = sfw.climate_zone_id
        join public.species s on s.id = sfw.species_id
       cross join lateral unnest(coalesce(s.interest_tags, '{}'::text[])) t
       group by cz.code, t
    )
    select c.zone, c.interest_group, c.pins, c.species_in_cell,
           coalesce(cv.covered_species, 0)::int as covered_species
      from cells c
      left join covered cv
        on cv.zone = c.zone and cv.interest_group = c.interest_group
     order by c.pins desc
     limit 40
  `;
  console.log('  zone  group                          pins      species  covered  gap');
  for (const r of cells) {
    const gap = r.species_in_cell - r.covered_species;
    const z = r.zone.padEnd(4);
    const g = String(r.interest_group).padEnd(30);
    const p = r.pins.toLocaleString().padStart(8);
    const s = String(r.species_in_cell).padStart(7);
    const cv = String(r.covered_species).padStart(7);
    const gp = String(gap).padStart(4);
    const flag = (gap > 0 && r.pins > 1000) ? '  ←' : '';
    console.log(`  ${z}  ${g} ${p}  ${s}  ${cv}  ${gp}${flag}`);
  }

  // ---- Step 4: top-priority cells (highest gap × pins) ----
  console.log('\n=== Top-priority cells (highest user impact per row to curate) ===');
  console.log('  rank  zone  group                          pins  gap-species  rank-score');
  const ranked = cells
    .map((r) => ({
      ...r,
      gap: r.species_in_cell - r.covered_species,
      score: r.pins * (r.species_in_cell - r.covered_species)
    }))
    .filter((r) => r.gap > 0 && r.pins > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);
  let i = 1;
  for (const r of ranked) {
    const z = r.zone.padEnd(4);
    const g = String(r.interest_group).padEnd(30);
    const p = r.pins.toLocaleString().padStart(7);
    const gp = String(r.gap).padStart(11);
    const sc = (r.score / 1000).toFixed(0) + 'k';
    console.log(`  ${String(i).padStart(4)}  ${z}  ${g} ${p}  ${gp}  ${sc.padStart(10)}`);
    i++;
  }

  await sql.end();
})();
