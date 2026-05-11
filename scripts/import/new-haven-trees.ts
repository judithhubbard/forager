// New Haven, CT — public street tree inventory hosted on Yale's
// hosted ArcGIS Online org (owner: `kbeechem`, Yale Urban Resources
// Initiative). URI partners with the New Haven Parks & Rec
// department to maintain the inventory.
//
// REST API: https://services1.arcgis.com/7uJv7I3kgh2y7Pe0/arcgis/rest/services/New_Haven_Street_Trees_02/FeatureServer/0
// ArcGIS item: https://www.arcgis.com/home/item.html?id=ac8d16bb874c41118c0550f2daff87dd
// Public-facing TreeKeeper viewer (read-only, separate product):
//   https://newhavenct.treekeepersoftware.com/index.cfm
//
// License: ArcGIS item metadata reports license = "None" and
// licenseInfo = "None". The dataset is shared publicly without
// access constraints. This is *not* a CC license; treat as
// "public-with-attribution per URI/New Haven Parks publication".
// Flag for explicit confirmation before adding to the Forager paid
// public tier, but the FeatureServer is openly queryable. Setting
// the importer to STAGED so a human can flip the visibility flag
// once attribution language is finalised.
//
// Verified count (2026-05-10): 32,553 total features, of which
// 32,476 have non-null COMM_NAME. The 77 null-species rows are
// `INV_TYPE='Planting'` placeholders for vacant pits — we filter
// them at the SoQL level.
//
// Schema: `COMM_NAME` (common name), `Genus`, `Species`, `Family`,
// `Cultivar`, `DBH`, `INV_TYPE` (Planting/Existing/Stump),
// `INV_DATE`, `STAFFNAME`, `ORG`, `Address`, `SiteID`,
// `LocationDetails`. `Genus` + `Species` combine into a Latin
// binomial when both present.
//
// Run: npm run import:new-haven-trees
// Pre-req: a 'New Haven public' region row.

import { fetchArcGisLayer, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'new-haven-uri-trees';
const ENDPOINT =
  'https://services1.arcgis.com/7uJv7I3kgh2y7Pe0/arcgis/rest/services/New_Haven_Street_Trees_02/FeatureServer/0/query';
const REGION_NAME = 'New Haven public';

interface NhFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    GlobalID?: string;
    SiteID?: string;
    INV_TYPE?: string;          // 'Existing' / 'Planting' / 'Stump' / 'Removal'
    COMM_NAME?: string;
    Genus?: string;
    Species?: string;
    Family?: string;
    Cultivar?: string;
    DBH?: number;
    Address?: string;
    INV_DATE?: number;
    ORG?: string;
    STAFFNAME?: string;
    TreeStature?: string;
  };
}

const config: ImportConfig<NhFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'New Haven Street Trees (URI / Parks & Rec)',
  sourceUrl:
    'https://www.arcgis.com/home/item.html?id=ac8d16bb874c41118c0550f2daff87dd',
  sourceDescription:
    'New Haven CT public street tree inventory (~32k records), ' +
    'maintained by Yale Urban Resources Initiative in partnership ' +
    'with the New Haven Parks & Recreation Department. Hosted on ' +
    'public ArcGIS Online. Item license string is "None" — treat ' +
    'as public-with-attribution per URI publication, pending ' +
    'explicit confirmation in the Forager About page. Filters ' +
    'COMM_NAME IS NOT NULL to drop "Planting" placeholder rows.',
  regionName: REGION_NAME,
  license: 'Public (URI / New Haven Parks; no explicit CC license)',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      // Filter to rows with a usable common name. Planting rows
      // have null COMM_NAME/Genus and represent vacant pits, not
      // trees.
      where: "COMM_NAME IS NOT NULL AND COMM_NAME <> ''"
    }) as Promise<NhFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = Number(f.geometry?.coordinates?.[0]);
    const lat = Number(f.geometry?.coordinates?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // New Haven proper sits ~41.27–41.36N, -72.97 – -72.86W.
    if (lat < 41.2 || lat > 41.4 || lng < -73.05 || lng > -72.8) return null;

    const genus = (f.properties?.Genus ?? '').trim();
    const species = (f.properties?.Species ?? '').trim();
    const common = (f.properties?.COMM_NAME ?? '').trim();
    if (!common && !genus) return null;

    // Build Latin if both Genus + Species exist.
    let latin = '';
    if (genus) {
      const g = genus.charAt(0).toUpperCase() + genus.slice(1).toLowerCase();
      const s = species.toLowerCase();
      latin = s ? `${g} ${s}` : g;
    }

    return {
      externalId: f.properties?.GlobalID
        ?? f.properties?.SiteID
        ?? String(f.properties?.OBJECTID ?? `${lng.toFixed(6)},${lat.toFixed(6)}`),
      scientificName: latin,
      commonName: common || undefined,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('New Haven trees import failed:', err);
  process.exit(1);
});
