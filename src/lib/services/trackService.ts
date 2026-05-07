// Track service. Phase A — file upload (GPX/KML) only. The live
// recorder (#40) and heatmap layer (#39) will both layer on top of
// this same service / schema.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { parseTrackFile, type ParsedTrack } from '$lib/utils/gpxParser';
import { haversineMeters } from '$lib/utils/distance';

export type TrackRow = {
  id: string;
  user_id: string;
  region_id: string | null;
  started_at: string;
  ended_at: string | null;
  /** PostGIS geometry — opaque from the client side; the heatmap
   *  layer reads track_points directly rather than parsing this. */
  path: unknown;
  distance_m: number | null;
  source: 'live' | 'gpx' | 'kml';
  visibility: 'private' | 'shared' | 'public';
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Fetch the lat/lng path for a single track. Used when the user
 *  toggles 'Show on map' on the /tracks page or after a fresh
 *  save so the just-recorded track stays visible. */
export async function getTrackPoints(trackId: string): Promise<Array<[number, number]>> {
  const all: Array<[number, number]> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('v_track_points_latlng')
      .select('lat, lng, recorded_at')
      .eq('track_id', trackId)
      .order('recorded_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[trackService] getTrackPoints error:', error);
      throw error;
    }
    const rows = (data ?? []) as Array<{ lat: number; lng: number }>;
    for (const r of rows) {
      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) all.push([r.lat, r.lng]);
    }
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Pull every track point belonging to the signed-in user as
 *  flat [lat, lng] pairs — the format leaflet.heat consumes
 *  directly. Paginated since PostgREST caps each response at 1000
 *  rows. Backed by the v_track_points_latlng view (migration 24)
 *  which inherits track_points's RLS via security_invoker. */
export async function listMyTrackPoints(): Promise<Array<[number, number]>> {
  const all: Array<[number, number]> = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('v_track_points_latlng')
      .select('lat, lng')
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[trackService] listMyTrackPoints error:', error);
      throw error;
    }
    const rows = (data ?? []) as Array<{ lat: number; lng: number }>;
    for (const r of rows) {
      if (Number.isFinite(r.lat) && Number.isFinite(r.lng)) {
        all.push([r.lat, r.lng]);
      }
    }
    if (rows.length < PAGE) break;
    // Safety stop — track datasets above this size will need a
    // bbox-aware fetch. Worth revisiting at that scale.
    if (all.length > 50000) break;
  }
  return all;
}

/** Fetch metadata for a known set of track ids. Used by the main
 *  map page so the recency-color of a displayed polyline can be
 *  computed from each track's started_at. Single round-trip; the
 *  caller deduplicates against a local cache. */
export async function listByIds(ids: string[]): Promise<TrackRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .in('id', ids);
  if (error) {
    console.error('[trackService] listByIds error:', error);
    throw error;
  }
  return (data ?? []) as TrackRow[];
}

export async function listMine(): Promise<TrackRow[]> {
  const { data, error } = await supabase
    .from('tracks')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) {
    console.error('[trackService] listMine error:', error);
    throw error;
  }
  return (data ?? []) as TrackRow[];
}


export interface ImportTrackOptions {
  regionId?: string | null;
  title?: string | null;
  visibility?: 'private' | 'shared' | 'public';
}

/** Import a parsed track into the DB. Inserts the tracks row plus
 *  every point into track_points, computes path geometry from the
 *  ordered points, and returns the new track id. */
export async function importParsedTrack(
  parsed: ParsedTrack,
  options: ImportTrackOptions = {}
): Promise<string> {
  if (parsed.points.length < 2) {
    throw new Error('Track has fewer than 2 valid points.');
  }
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('Sign in to upload tracks.');

  // Sort by recorded_at when available so distance + path follow
  // chronological order. If timestamps are missing we trust the
  // file's source order.
  const points = parsed.points.slice();
  if (points.every((p) => p.recorded_at)) {
    points.sort((a, b) => (a.recorded_at ?? '').localeCompare(b.recorded_at ?? ''));
  }

  const startedAt = points[0].recorded_at ?? new Date().toISOString();
  const endedAt = points[points.length - 1].recorded_at ?? null;

  let distance_m = 0;
  for (let i = 1; i < points.length; i++) {
    distance_m += haversineMeters(
      points[i - 1].lat, points[i - 1].lng,
      points[i].lat,     points[i].lng
    );
  }

  // The tracks.path column is nullable; we leave it null on insert
  // and let consumers (heatmap, future overlays) read directly
  // from track_points instead. PostgREST's geometry encoding has
  // version-dependent quirks and was the most plausible cause of
  // 'could not save the recording' reports. distance_m is still
  // populated from the haversine sum above, so size + duration
  // queries work without geometry.
  const trackId = uuidv4();
  const { error: insertErr } = await supabase.from('tracks').insert({
    id: trackId,
    user_id: uid,
    region_id: options.regionId ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    distance_m,
    source: parsed.source,
    visibility: options.visibility ?? 'private',
    title: options.title ?? parsed.title ?? null
  });
  if (insertErr) {
    console.error('[trackService] track insert error:', insertErr);
    throw insertErr;
  }

  // Bulk-insert points in batches so a long track doesn't hit any
  // single-row payload limit.
  const BATCH = 1000;
  // Collapse identical recorded_at timestamps to satisfy the
  // composite primary key (track_id, recorded_at). For untimed
  // GPX files we synthesize a +1ms-per-point series so points
  // stay distinct.
  let lastTs = -Infinity;
  const stamped = points.map((p, i) => {
    const base = p.recorded_at
      ? Date.parse(p.recorded_at)
      : Date.parse(startedAt) + i;
    const ts = Math.max(base, lastTs + 1);
    lastTs = ts;
    return { ...p, ts };
  });

  for (let i = 0; i < stamped.length; i += BATCH) {
    const slice = stamped.slice(i, i + BATCH);
    const rows = slice.map((p) => ({
      track_id: trackId,
      recorded_at: new Date(p.ts).toISOString(),
      // EWKT — PostGIS accepts this as input for geography(Point,
      // 4326) directly. PostgREST's GeoJSON-on-insert support is
      // version-dependent, so the explicit text form is safer
      // across Supabase upgrades.
      location: `SRID=4326;POINT(${p.lng} ${p.lat})` as unknown as never,
      elevation_m: p.elevation_m,
      accuracy_m: null
    }));
    const { error: pointsErr } = await supabase.from('track_points').insert(rows);
    if (pointsErr) {
      // Roll back the track row so we don't leave a half-imported
      // record. RLS lets the owner delete their own rows.
      await supabase.from('tracks').delete().eq('id', trackId);
      console.error('[trackService] points insert error:', pointsErr);
      throw pointsErr;
    }
  }

  return trackId;
}

/** Import from a File handle (browser <input type=file>). */
export async function importTrackFile(
  file: File,
  options: ImportTrackOptions = {}
): Promise<string> {
  const text = await file.text();
  const parsed = parseTrackFile(file.name, text);
  return importParsedTrack(parsed, {
    ...options,
    title: options.title ?? parsed.title ?? file.name.replace(/\.[^.]+$/, '')
  });
}

export async function remove(trackId: string): Promise<void> {
  const { error } = await supabase.from('tracks').delete().eq('id', trackId);
  if (error) {
    console.error('[trackService] remove error:', error);
    throw error;
  }
}

export async function updateMeta(
  trackId: string,
  patch: { title?: string | null; notes?: string | null; visibility?: 'private' | 'shared' | 'public' }
): Promise<void> {
  const { error } = await supabase.from('tracks').update(patch).eq('id', trackId);
  if (error) {
    console.error('[trackService] updateMeta error:', error);
    throw error;
  }
}
