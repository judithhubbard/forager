// Audit Dryad city-tree pins: per-city distance distribution from
// city centroid. Surface where the 200km outlier filter was too
// loose. Output suggests a tighter threshold and shows how many
// pins would be dropped at various cutoffs.

const postgres = require('postgres');
const { config } = require('dotenv');
const path = require('path');
config({ path: path.resolve(__dirname, '..', '.env.local') });

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', onnotice: () => undefined });

(async () => {
  // Per-source centroid + distance percentiles. Use ST_Distance on
  // geography (meters), grouped by source.
  const r = await sql`
    with by_src as (
      select import_source,
             ST_X(ST_Centroid(ST_Collect(location::geometry))::geometry) as cx,
             ST_Y(ST_Centroid(ST_Collect(location::geometry))::geometry) as cy,
             count(*) as n_pins
        from public.pins
       where import_source like 'dryad-trees-%'
       group by import_source
    ),
    distances as (
      select p.import_source, p.id,
             ST_Distance(
               p.location,
               ST_SetSRID(ST_MakePoint(b.cx, b.cy), 4326)::geography
             ) / 1000.0 as dist_km
        from public.pins p
        join by_src b on b.import_source = p.import_source
       where p.import_source like 'dryad-trees-%'
    )
    select d.import_source,
           b.n_pins,
           percentile_cont(0.5)  within group (order by dist_km) as p50_km,
           percentile_cont(0.95) within group (order by dist_km) as p95_km,
           percentile_cont(0.99) within group (order by dist_km) as p99_km,
           max(dist_km) as max_km,
           count(*) filter (where dist_km > 25) as over_25,
           count(*) filter (where dist_km > 50) as over_50,
           count(*) filter (where dist_km > 100) as over_100
      from distances d
      join by_src b on b.import_source = d.import_source
     group by d.import_source, b.n_pins
     order by max_km desc
  `;

  console.log(`Per-source distance from centroid (km):`);
  console.log(`source                              pins    p50   p95   p99   max | over25 over50 over100`);
  for (const x of r) {
    const src = String(x.import_source).padEnd(36);
    const n = String(x.n_pins).padStart(7);
    const p50 = Number(x.p50_km).toFixed(1).padStart(5);
    const p95 = Number(x.p95_km).toFixed(1).padStart(5);
    const p99 = Number(x.p99_km).toFixed(1).padStart(5);
    const mx = Number(x.max_km).toFixed(0).padStart(5);
    const o25 = String(x.over_25).padStart(6);
    const o50 = String(x.over_50).padStart(6);
    const o100 = String(x.over_100).padStart(7);
    console.log(`${src}${n}  ${p50} ${p95} ${p99} ${mx} | ${o25} ${o50} ${o100}`);
  }

  // Aggregate "would be deleted" counts
  const totals = await sql`
    with by_src as (
      select import_source,
             ST_X(ST_Centroid(ST_Collect(location::geometry))::geometry) as cx,
             ST_Y(ST_Centroid(ST_Collect(location::geometry))::geometry) as cy
        from public.pins
       where import_source like 'dryad-trees-%'
       group by import_source
    )
    select count(*) filter (where ST_Distance(p.location,
             ST_SetSRID(ST_MakePoint(b.cx, b.cy), 4326)::geography) / 1000.0 > 25) as over_25,
           count(*) filter (where ST_Distance(p.location,
             ST_SetSRID(ST_MakePoint(b.cx, b.cy), 4326)::geography) / 1000.0 > 50) as over_50,
           count(*) filter (where ST_Distance(p.location,
             ST_SetSRID(ST_MakePoint(b.cx, b.cy), 4326)::geography) / 1000.0 > 100) as over_100,
           count(*) as total
      from public.pins p
      join by_src b on b.import_source = p.import_source
     where p.import_source like 'dryad-trees-%'
  `;
  console.log('');
  console.log(`Across all dryad-* sources (${totals[0].total.toLocaleString()} pins):`);
  console.log(`  >  25 km from centroid: ${totals[0].over_25.toLocaleString()}`);
  console.log(`  >  50 km from centroid: ${totals[0].over_50.toLocaleString()}`);
  console.log(`  > 100 km from centroid: ${totals[0].over_100.toLocaleString()}`);
  await sql.end();
})();
