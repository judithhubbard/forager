// Portland (OR) Street Tree Inventory — active records.
//
// Source: https://gis-pdx.opendata.arcgis.com/datasets/PDX::street-tree-inventory-active-records
// API:    ArcGIS REST FeatureServer
// License: City of Portland open data terms — permissive.
// ~252k rows. Tree Inventory 2.0 schema (Genus_speci + Common_nam).
//
// Run with:
//   npm run import:portland-trees
//
// Requires a 'Portland public' region row before running.

import {
  fetchArcGisLayer,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'portland-street-trees';
const ENDPOINT =
  'https://services.arcgis.com/quVN97tn06YNGj9s/arcgis/rest/services/Street_Trees/FeatureServer/0/query';
const REGION_NAME = 'Portland public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    InventoryID?: string;
    Genus_speci?: string;
    Genus_species?: string;
    Common_nam?: string;
    Common_name?: string;
  };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Portland Street Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Portland (OR) Urban Forestry street tree inventory — ' +
    'active records only. Tree Inventory 2.0 schema with both ' +
    'scientific and common names.',
  regionName: REGION_NAME,
  license: 'City of Portland Open Data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'Genus_species IS NOT NULL OR Genus_speci IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const latin = f.properties?.Genus_species ?? f.properties?.Genus_speci;
    if (!latin) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? f.properties?.InventoryID ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: latin,
      commonName: f.properties?.Common_name ?? f.properties?.Common_nam,
      lng: lng as number,
      lat: lat as number,
      raw: f
    };
  }
};

runImport(config).catch((err) => {
  console.error('Portland trees import failed:', err);
  process.exit(1);
});
