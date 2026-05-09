// Portland (OR) Street Tree Inventory — active records.
//
// Source: https://gis-pdx.opendata.arcgis.com/datasets/PDX::street-tree-inventory-active-records
// API:    portlandmaps.com REST MapServer (NOT services.arcgis.com)
// License: City of Portland open data terms — permissive.
// ~252k rows. Single SPECIES column with "Scientific - Common"
// concatenated, parsed on the way in.
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
  'https://www.portlandmaps.com/od/rest/services/COP_OpenData_Environment/MapServer/1415/query';
const REGION_NAME = 'Portland public';

interface ArcGisFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    OBJECTID?: number;
    SPECIES?: string;
  };
}

/** Portland packs both names into one field as "Genus species - Common Name".
 *  Some entries are genus-only ("Cornus spp. - dogwood") — drop "spp." so
 *  the matcher gets a clean genus string. */
function parseSpeciesField(raw: string | undefined): { scientific?: string; common?: string } {
  if (!raw) return {};
  const idx = raw.indexOf(' - ');
  if (idx < 0) return { scientific: raw.trim() };
  const sci = raw.slice(0, idx).trim().replace(/\s+spp\.?$/i, '');
  const com = raw.slice(idx + 3).trim();
  return { scientific: sci || undefined, common: com || undefined };
}

const config: ImportConfig<ArcGisFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Portland Street Tree Inventory',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'City of Portland (OR) Urban Forestry street tree inventory — ' +
    'active records only. SPECIES column packs scientific + common ' +
    'name as "Scientific - Common"; importer parses both.',
  regionName: REGION_NAME,
  license: 'City of Portland Open Data',
  async fetchAll() {
    return fetchArcGisLayer({
      url: ENDPOINT,
      where: 'SPECIES IS NOT NULL'
    }) as Promise<ArcGisFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const lng = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const { scientific, common } = parseSpeciesField(f.properties?.SPECIES);
    if (!scientific) return null;
    return {
      externalId: String(f.properties?.OBJECTID ?? `${(lng as number).toFixed(6)},${(lat as number).toFixed(6)}`),
      scientificName: scientific,
      commonName: common,
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
