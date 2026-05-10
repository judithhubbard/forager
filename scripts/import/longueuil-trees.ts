// Ville de Longueuil — "Arbres" (mostly municipal inventory across
// the South Shore agglomeration: Longueuil, Boucherville, Brossard,
// Saint-Bruno-de-Montarville, Saint-Hubert, Saint-Lambert).
//
// Source page: https://www.donneesquebec.ca/recherche/dataset/arbres
// Resource:    GeoJSON one-shot download (no CKAN datastore for this
//              dataset — confirmed 2026-05-10: the resource UUID
//              23cde69a-a1d7-4775-8271-e3b46b3a6d83 is not loaded
//              into datastore. Static GeoJSON ~25MB is the only path.)
// License:     Creative Commons Attribution 4.0 (CC BY 4.0)
//
// Verified feature count (2026-05-10): 99,345. Climate: zone 5b,
// same as Montréal proper. Inventory is in progress, so the dataset
// description warns this is a partial / growing snapshot.
//
// Schema (unusual single-field species):
//   - geometry.coordinates: [lng, lat] in WGS84
//   - properties.Espece: "Latin - French" combined string, e.g.
//       "Acer rubrum - Érable rouge"
//       "Tilia sp. - Tilleul sp."
//       "Acer platanoides 'columnare' - Érable de norvège ..."
//   - properties.Diametre_Tronc: trunk diameter (cm)
//
// We split Espece on " - " to separate Latin (left) from French
// common (right). Rows with bare "sp." Latin (genus only, no
// species epithet) are still emitted — matchSpecies will drop them
// naturally since forageable_species is binomial-keyed.
//
// Run: npm run import:longueuil-trees
// Pre-req: a 'Longueuil public' region row.

import { fetchGeoJsonUrl, runImport, type ImportConfig } from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'longueuil-arbres';
const GEOJSON_URL =
  'https://www.donneesquebec.ca/recherche/dataset/9ed153b2-4751-4e03-862f-6d4027e6f2a6/resource/23cde69a-a1d7-4775-8271-e3b46b3a6d83/download/arbres.geojson';
const REGION_NAME = 'Longueuil public';

interface LongFeature {
  type?: 'Feature';
  geometry?: { type: 'Point'; coordinates: [number, number] } | null;
  properties?: {
    Espece?: string;
    Diametre_Tronc?: string;
  };
}

/** Split "Acer rubrum - Érable rouge" → { latin: 'Acer rubrum',
 *  common: 'Érable rouge' }. Returns null if the string is empty
 *  or unparseable. */
function splitEspece(s: string | undefined): { latin: string; common?: string } | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  // Split on the first " - " (em-dash variants don't appear in the
  // data sample, but tolerate hyphen-space-hyphen too).
  const m = trimmed.split(/\s+[-–—]\s+/);
  const latin = (m[0] ?? '').trim();
  if (!latin) return null;
  const common = m.slice(1).join(' - ').trim();
  return { latin, common: common || undefined };
}

const config: ImportConfig<LongFeature> = {
  sourceId: SOURCE_ID,
  sourceName: 'Longueuil Public Trees (Arbres)',
  sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/arbres',
  sourceDescription:
    'Ville de Longueuil public tree inventory (~99k features across ' +
    'the agglomeration: Longueuil, Boucherville, Brossard, Saint-' +
    'Bruno, Saint-Hubert, Saint-Lambert). CC BY 4.0. Inventory is ' +
    'in progress so this is a growing snapshot. Species field is a ' +
    'single "Latin - French" string which we split at import time.',
  regionName: REGION_NAME,
  license: 'CC BY 4.0',
  async fetchAll() {
    return fetchGeoJsonUrl({
      url: GEOJSON_URL,
      label: 'longueuil/arbres.geojson'
    }) as Promise<LongFeature[]>;
  },
  mapFeature(f): ImportRecord | null {
    const coords = f.geometry?.coordinates;
    if (!coords) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // Longueuil agglomeration sits ~45.4–45.7N, -73.6 – -73.3W.
    if (lat < 45.2 || lat > 45.9 || lng < -73.8 || lng > -73.1) return null;

    const parsed = splitEspece(f.properties?.Espece);
    if (!parsed) return null;

    return {
      // No stable per-record id in the GeoJSON; fall back to coord
      // hash. Re-runs will be idempotent on identical coords.
      externalId: `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: parsed.latin,
      commonName: parsed.common,
      lng,
      lat,
      raw: f as unknown as Record<string, unknown>
    };
  }
};

runImport(config).catch((err) => {
  console.error('Longueuil trees import failed:', err);
  process.exit(1);
});
