// SF Street Tree Map — DataSF Socrata dataset of street trees in
// San Francisco, ~200k records with Latin + common names smushed
// together in a single `qspecies` field. The framework's species
// matcher takes the Latin half; non-forageable trees are dropped.
//
// Source: https://data.sfgov.org/Health-and-Social-Services/Street-Tree-Map/337t-q2b4
// API:    https://data.sfgov.org/resource/tkzw-k3nq.json
// License: public domain (DataSF terms of use).
//
// Run with:
//   npm run import:sf-trees
//
// Requires the destination region to exist — provision a region
// named 'SF public' before running, otherwise registerImportSource
// throws on the missing region.

import {
  fetchOpenDataApiJson,
  runImport,
  type ImportConfig
} from './lib/framework';
import type { ImportRecord } from './lib/upsert';

const SOURCE_ID = 'sf-street-trees';
const ENDPOINT = 'https://data.sfgov.org/resource/tkzw-k3nq.json';
const REGION_NAME = 'SF public';

interface SfTree {
  treeid?: string;
  /** SF stores 'Latin :: Common Name' as a single field, e.g.
   *  'Fraxinus uhdei :: Shamel Ash: Evergreen Ash'. We split on
   *  ' :: ' and keep the Latin half for species matching. */
  qspecies?: string;
  latitude?: string;
  longitude?: string;
}

function splitQspecies(raw: string | undefined): { latin?: string; common?: string } {
  if (!raw) return {};
  const idx = raw.indexOf('::');
  if (idx === -1) return { latin: raw.trim() };
  return {
    latin: raw.slice(0, idx).trim(),
    common: raw.slice(idx + 2).trim()
  };
}

const config: ImportConfig<SfTree> = {
  sourceId: SOURCE_ID,
  sourceName: 'SF Street Tree Map',
  sourceUrl: ENDPOINT,
  sourceDescription:
    'San Francisco Department of Public Works street tree inventory. ' +
    'Public domain via DataSF terms of use.',
  regionName: REGION_NAME,
  license: 'DataSF terms of use (public domain)',
  async fetchAll() {
    return fetchOpenDataApiJson({
      url: ENDPOINT,
      // Trim at the API tier: drop rows missing species or coordinates
      // so we don't pay for them in bandwidth or in the species matcher.
      where: 'qspecies IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL'
    }) as Promise<SfTree[]>;
  },
  mapFeature(t): ImportRecord | null {
    const lng = Number(t.longitude);
    const lat = Number(t.latitude);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const { latin, common } = splitQspecies(t.qspecies);
    if (!latin) return null;
    return {
      externalId: t.treeid ?? `${lng.toFixed(6)},${lat.toFixed(6)}`,
      scientificName: latin,
      commonName: common,
      lng,
      lat,
      raw: t
    };
  }
};

runImport(config).catch((err) => {
  console.error('SF trees import failed:', err);
  process.exit(1);
});
