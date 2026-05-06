// Track service. Phase A — file upload (GPX/KML) only. The live
// recorder (#40) and heatmap layer (#39) will both layer on top of
// this same service / schema.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { parseTrackFile, type ParsedTrack } from '$lib/utils/gpxParser';

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

/** Great-circle distance via Haversine (meters). Cheap to compute
 *  client-side; PostGIS could do it server-side but a few hundred
 *  multiplications per track is well under any threshold worth a
 *  round-trip. */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

  // PostgREST + PostGIS accepts GeoJSON for geometry/geography
  // columns. LineString coordinates are [lng, lat].
  const path = {
    type: 'LineString' as const,
    coordinates: points.map((p) => [p.lng, p.lat])
  };

  const trackId = uuidv4();
  const { error: insertErr } = await supabase.from('tracks').insert({
    id: trackId,
    user_id: uid,
    region_id: options.regionId ?? null,
    started_at: startedAt,
    ended_at: endedAt,
    path: path as unknown as never,
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
      location: {
        type: 'Point' as const,
        coordinates: [p.lng, p.lat]
      } as unknown as never,
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
