// Pin service: read & write operations against the pins table / v_pin_effective view.
// Per PLAN §10 C18, components import from here, not from the raw client.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import { bumpDataChange, bumpPinChanged } from '$lib/stores/dataChange';
import type { Database } from '$lib/database.types';

export type Pin = Database['public']['Tables']['pins']['Row'];
export type PinInsert = Database['public']['Tables']['pins']['Insert'];
export type PinEffective = Database['public']['Views']['v_pin_effective']['Row'];
export type PinStatus = Database['public']['Enums']['pin_status'];

export type Visibility = 'shared' | 'private' | 'public';

/** Bbox in [west, south, east, north] order — matches Leaflet's
 *  LatLngBounds.toBBoxString() output. Used by the anon public-pin
 *  fetch path and by the cluster RPC. */
export type Bbox = [number, number, number, number];

/** A single cluster point returned by public_pins_clusters. */
export interface PinCluster {
  cluster_id: number | null;
  count_pins: number;
  centroid_lng: number;
  centroid_lat: number;
  representative_species_id: string | null;
}

/** A pre-aggregated density bucket from the pin_density_grid table.
 *  Returned by public_pins_density. Each bucket represents one cell
 *  at the chosen zoom band and carries an exact pin count. */
export interface PinDensityBucket {
  count_pins: number;
  centroid_lng: number;
  centroid_lat: number;
}

export interface CreatePinInput {
  regionId: string;
  /** Required in v1 (species picker enforces it). "Unknown" species is a v1.x add. */
  speciesId: string;
  lng: number;
  lat: number;
  locationAccuracyM?: number | null;
  displayName?: string | null;
  notes?: string | null;
  /** Omit to fall back to the region's default_pin_visibility (set
   *  per region by the welcome flow). */
  visibility?: Visibility;
}

/** Create a pin via the outbox. Returns the new pin's id. */
export async function create(input: CreatePinInput): Promise<string> {
  const id = uuidv4();
  await enqueue({
    id,
    entityType: 'pin',
    op: 'insert',
    payload: input,
    exec: async () => {
      const args: {
        p_id: string;
        p_region_id: string;
        p_species_id: string;
        p_lng: number;
        p_lat: number;
        p_location_accuracy_m?: number;
        p_display_name?: string;
        p_notes?: string;
        p_status?: PinStatus;
        p_visibility?: Visibility;
      } = {
        p_id: id,
        p_region_id: input.regionId,
        p_species_id: input.speciesId,
        p_lng: input.lng,
        p_lat: input.lat,
        p_status: 'active'
      };
      if (input.locationAccuracyM != null) args.p_location_accuracy_m = input.locationAccuracyM;
      if (input.displayName) args.p_display_name = input.displayName;
      if (input.notes) args.p_notes = input.notes;
      if (input.visibility) args.p_visibility = input.visibility;

      const { error } = await supabase.rpc('insert_pin', args);
      if (error) {
        console.error('[pinService] create error:', error);
        throw error;
      }
    }
  });
  bumpDataChange();
  return id;
}

/** Pins in a region, with computed effective status, ripe-now, and lng/lat.
 *  Supabase's PostgREST caps responses at db-max-rows (default 1000) and
 *  .limit() can't override the cap. Paginate via .range() until empty.
 *  TODO(Phase 3): switch to bounding-box-based pagination when this gets large. */
export async function listByRegion(regionId: string): Promise<PinEffective[]> {
  const all: PinEffective[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('v_pin_effective')
      .select('*')
      .eq('region_id', regionId)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[pinService] listByRegion error:', error);
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as PinEffective[]));
    if (data.length < PAGE) break;
  }
  return all;
}

/** Public pins inside the given bbox. Anon-callable. Capped at
 *  maxRows (server enforces ≤1000). At low zooms callers should
 *  prefer listPublicPinClusters() — passing a 50-state bbox here
 *  would silently truncate to 500 pins. */
export async function listPublicPins(
  bbox: Bbox,
  maxRows: number = 500
): Promise<PinEffective[]> {
  const [west, south, east, north] = bbox;
  const { data, error } = await supabase.rpc('public_pins_bbox', {
    p_min_lng: west,
    p_min_lat: south,
    p_max_lng: east,
    p_max_lat: north,
    p_max_rows: maxRows
  });
  if (error) {
    console.error('[pinService] listPublicPins error:', error);
    throw error;
  }
  return (data ?? []) as PinEffective[];
}

/** Authed analog of listPublicPins: pins inside a bbox, scoped to one
 *  region. RLS still enforces membership; non-members get an empty
 *  set rather than an error. Used by the main map's viewport-driven
 *  fetch path so big regions (Toronto-public-scale: 30k+ pins) don't
 *  paginate the whole region just to render the visible viewport. */
export async function listRegionPins(
  regionId: string,
  bbox: Bbox,
  maxRows: number = 1000
): Promise<PinEffective[]> {
  const [west, south, east, north] = bbox;
  // Cast the RPC name through unknown — the generated Database type
  // doesn't know about region_pins_bbox until types are regenerated
  // post-migration. Same pattern used for region_pins_clusters and
  // for is_global_admin elsewhere.
  const { data, error } = await supabase.rpc(
    'region_pins_bbox' as never,
    {
      p_region_id: regionId,
      p_min_lng: west,
      p_min_lat: south,
      p_max_lng: east,
      p_max_lat: north,
      p_max_rows: maxRows
    } as never
  );
  if (error) {
    console.error('[pinService] listRegionPins error:', error);
    throw error;
  }
  return (data ?? []) as unknown as PinEffective[];
}

/** Authed analog of listPublicPinClusters: cluster aggregates inside
 *  a bbox, scoped to one region. Uses the same epsDeg→zoom mapping
 *  as the public path (clusterEpsForZoom). */
export async function listRegionPinClusters(
  regionId: string,
  bbox: Bbox,
  epsDeg: number = 0.05
): Promise<PinCluster[]> {
  const [west, south, east, north] = bbox;
  const { data, error } = await supabase.rpc(
    'region_pins_clusters' as never,
    {
      p_region_id: regionId,
      p_min_lng: west,
      p_min_lat: south,
      p_max_lng: east,
      p_max_lat: north,
      p_eps_deg: epsDeg,
      p_minpoints: 1
    } as never
  );
  if (error) {
    console.error('[pinService] listRegionPinClusters error:', error);
    throw error;
  }
  return (data ?? []) as unknown as PinCluster[];
}

/** ST_ClusterDBSCAN-aggregated cluster points for the public dataset.
 *  epsDeg is the cluster radius in degrees (rough rule of thumb:
 *  one degree of latitude ≈ 111km, so 0.05° ≈ 5km — appropriate for
 *  zoom ~6). Tune by zoom level. */
export async function listPublicPinClusters(
  bbox: Bbox,
  epsDeg: number = 0.05
): Promise<PinCluster[]> {
  const [west, south, east, north] = bbox;
  const { data, error } = await supabase.rpc('public_pins_clusters', {
    p_min_lng: west,
    p_min_lat: south,
    p_max_lng: east,
    p_max_lat: north,
    p_eps_deg: epsDeg,
    p_minpoints: 1
  });
  if (error) {
    console.error('[pinService] listPublicPinClusters error:', error);
    throw error;
  }
  return (data ?? []) as PinCluster[];
}

/** Map a zoom level to its density-grid band. Mirrors the server's
 *  band_for_zoom in migration 36 — keep in sync. The client needs
 *  this to know the cell size when rendering the heatmap rectangles. */
export function densityBandForZoom(zoom: number): number {
  if (zoom < 6) return 0;
  if (zoom < 8) return 1;
  if (zoom < 10) return 2;
  if (zoom < 12) return 3;
  return 4;
}

/** Cell size in degrees for a given band. Mirrors server's
 *  eps_for_band. */
export function densityEpsForBand(band: number): number {
  const eps = [0.5, 0.1, 0.02, 0.005, 0.001];
  return eps[band] ?? 0.5;
}

/** Pre-aggregated density buckets for the public-layer heatmap.
 *  Reads from pin_density_grid (refreshed on import). The server
 *  picks the right zoom band based on the passed-in map zoom and
 *  returns only buckets in the bbox. Way cheaper than scanning the
 *  pins table for individual rows. */
export async function listPublicPinDensity(
  bbox: Bbox,
  zoom: number
): Promise<PinDensityBucket[]> {
  const [west, south, east, north] = bbox;
  // Cast through unknown — the generated Database type doesn't yet
  // know about public_pins_density (regen lag).
  const { data, error } = await supabase.rpc(
    'public_pins_density' as never,
    {
      p_min_lng: west,
      p_min_lat: south,
      p_max_lng: east,
      p_max_lat: north,
      p_zoom: Math.round(zoom)
    } as never
  );
  if (error) {
    console.error('[pinService] listPublicPinDensity error:', error);
    throw error;
  }
  return (data ?? []) as unknown as PinDensityBucket[];
}

/** Pick a sensible cluster eps (in degrees) based on map zoom.
 *  Eps doubles as the grid-cell size in degrees for the cluster
 *  RPC. Re-tuned looser after the first version split mid-size
 *  cities into ~10 sub-clusters at zoom 7–8 — too granular for
 *  a 'where is density' overview. Now zoom 6–8 keeps cities as
 *  1–4 cells, only zoom 10+ starts showing per-block detail. */
export function clusterEpsForZoom(zoom: number): number {
  if (zoom < 4)  return 2.0;   // continent: states/regions as one cell
  if (zoom < 6)  return 0.6;   // multi-state: each city as one cell
  if (zoom < 8)  return 0.2;   // metro: city splits into 1-4 quadrants
  if (zoom < 10) return 0.06;  // city: large districts
  if (zoom < 12) return 0.02;  // neighborhood: ~2km clusters
  return 0.005;                // street: ~500m clusters, near-individual
}

/** Pins currently in their ripe window (and not gone/dormant). */
export async function listRipeNow(regionId: string): Promise<PinEffective[]> {
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('*')
    .eq('region_id', regionId)
    .eq('is_ripe_now', true);

  if (error) {
    console.error('[pinService] listRipeNow error:', error);
    throw error;
  }
  return (data ?? []).filter(
    (p) => p.effective_status !== 'gone' && p.effective_status !== 'dormant'
  );
}

/** Re-export of the shared object-shape haversine. Lives at this
 *  path only because the ripe page imports it from here. */
export { haversineBetween as haversineMeters } from '$lib/utils/distance';

/** Batch fetch of multiple pins by id via the effective view. One
 *  round-trip; avoids N+1 patterns where a page wants effective
 *  rows for a small set of known pin ids (e.g. watchlist). */
export async function getEffectiveMany(ids: string[]): Promise<PinEffective[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('*')
    .in('id', ids);
  if (error) {
    console.error('[pinService] getEffectiveMany error:', error);
    throw error;
  }
  return (data ?? []) as PinEffective[];
}

/** Fetch one representative lng/lat for a region — used by callers
 *  that just need an "approximately here" point (e.g. weather
 *  lookups). Cheap: single row, two columns. The earlier pattern
 *  was to call listByRegion() and average every pin's coordinates,
 *  which paginated the whole region for what amounts to one
 *  weather-grid cell of resolution. */
export async function getOneRegionPinLocation(
  regionId: string
): Promise<{ lng: number; lat: number } | null> {
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('lng,lat')
    .eq('region_id', regionId)
    .not('lng', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[pinService] getOneRegionPinLocation error:', error);
    return null;
  }
  if (!data || data.lng == null || data.lat == null) return null;
  return { lng: data.lng, lat: data.lat };
}

/** A single pin via the effective view. */
export async function getEffective(id: string): Promise<PinEffective | null> {
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[pinService] getEffective error:', error);
    throw error;
  }
  return data;
}

/** Flip a pin between shared and private. RLS gates this to the owner
 *  (or a region admin) via the pins UPDATE policy. */
export async function updateVisibility(pinId: string, visibility: Visibility): Promise<void> {
  await enqueue({
    id: pinId,
    entityType: 'pin',
    op: 'update',
    payload: { visibility },
    exec: async () => {
      const { error } = await supabase.from('pins').update({ visibility }).eq('id', pinId);
      if (error) {
        console.error('[pinService] updateVisibility error:', error);
        throw error;
      }
    }
  });
  bumpPinChanged(pinId);
}

/** Move a pin to a new lng/lat. Owner-or-admin only via RLS. Used
 *  for correcting mis-located pins from the pin detail panel. */
export async function updateLocation(
  pinId: string,
  lng: number,
  lat: number,
  accuracyM?: number | null
): Promise<void> {
  await enqueue({
    id: pinId,
    entityType: 'pin',
    op: 'update',
    payload: { lng, lat, accuracyM },
    exec: async () => {
      const { error } = await supabase.rpc('update_pin_location', {
        p_pin_id: pinId,
        p_lng: lng,
        p_lat: lat,
        p_location_accuracy_m: accuracyM ?? null
      });
      if (error) {
        console.error('[pinService] updateLocation error:', error);
        throw error;
      }
    }
  });
  bumpPinChanged(pinId);
}

/** Update the stored status of a pin. */
export async function updateStatus(pinId: string, status: PinStatus): Promise<void> {
  await enqueue({
    id: pinId,
    entityType: 'pin',
    op: 'update',
    payload: { status },
    exec: async () => {
      const { error } = await supabase.from('pins').update({ status }).eq('id', pinId);
      if (error) {
        console.error('[pinService] updateStatus error:', error);
        throw error;
      }
    }
  });
  bumpPinChanged(pinId);
}
