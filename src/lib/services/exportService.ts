// Personal data export. Bundles a signed-in user's contributions
// into a zip with multiple files in standard formats:
//   * pins.geojson      — pins they created, GeoJSON FeatureCollection
//   * observations.csv  — observations on those pins (one row per obs)
//   * photos.csv        — photo metadata + signed URLs (URLs expire,
//                         so the file warns about that)
//   * tracks.geojson    — recorded tracks as LineString features
//   * watchlist.csv     — species + pin-level watchlist entries
//   * README.txt        — explains each file + caveats
//
// Everything runs client-side. RLS is the access gate — we just call
// the same authenticated services the rest of the app uses, so the
// user can only see their own data anyway.

import { zipSync, strToU8 } from 'fflate';
import { supabase } from '$lib/supabase';
import { signUrls } from './photoService';

interface ExportContext {
  userId: string;
  username: string | null;
  exportedAt: string;
}

interface PinRow {
  id: string;
  region_id: string | null;
  species_id: string | null;
  display_name: string | null;
  status: string;
  visibility: string;
  notes: string | null;
  access_status: string | null;
  location_accuracy_m: number | null;
  created_at: string;
  updated_at: string;
  lat: number;
  lng: number;
}

interface ObsRow {
  id: string;
  pin_id: string;
  stage: string;
  observed_at: string;
  observed_precision: string | null;
  quality_rating: number | null;
  quality_notes: string | null;
  visibility: string;
  created_at: string;
}

interface PhotoRow {
  id: string;
  pin_id: string;
  observation_id: string | null;
  storage_path: string;
  thumbnail_path: string;
  caption: string | null;
  license: string;
  photographer_credit: string | null;
  captured_lat: number | null;
  captured_lng: number | null;
  captured_accuracy_m: number | null;
  created_at: string;
}

interface TrackRow {
  id: string;
  title: string | null;
  source: string;
  started_at: string | null;
  ended_at: string | null;
  total_distance_m: number | null;
  visibility: string;
  created_at: string;
  points: Array<{ lat: number; lng: number; recorded_at: string | null; elevation_m: number | null }>;
}

interface WatchRow {
  id: string;
  species_id: string | null;
  pin_id: string | null;
  notify_email: boolean;
  notify_in_app: boolean;
  created_at: string;
}

/** Run the export. Returns a Blob the caller hands to the
 *  browser-download utility. Bundle name uses today's date so a
 *  user with multiple exports doesn't clobber prior files. */
export async function exportPersonalData(): Promise<{ blob: Blob; filename: string }> {
  const ctx = await getContext();
  const [pins, observations, photos, tracks, watchlist] = await Promise.all([
    fetchPins(ctx.userId),
    fetchObservations(ctx.userId),
    fetchPhotos(ctx.userId),
    fetchTracks(ctx.userId),
    fetchWatchlist(ctx.userId)
  ]);

  const files: Record<string, Uint8Array> = {
    'README.txt':       strToU8(buildReadme(ctx, pins, observations, photos, tracks, watchlist)),
    'pins.geojson':     strToU8(JSON.stringify(buildPinsGeoJSON(pins), null, 2)),
    'observations.csv': strToU8(buildObservationsCSV(observations)),
    'photos.csv':       strToU8(buildPhotosCSV(photos)),
    'tracks.geojson':   strToU8(JSON.stringify(buildTracksGeoJSON(tracks), null, 2)),
    'watchlist.csv':    strToU8(buildWatchlistCSV(watchlist))
  };

  const zipped = zipSync(files);
  // fflate gives us a Uint8Array; wrap as Blob with the correct backing buffer
  const blob = new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: 'application/zip' });
  const date = ctx.exportedAt.slice(0, 10);
  const filename = `forager-export-${ctx.username ?? 'user'}-${date}.zip`;
  return { blob, filename };
}

/** Download helper — creates an object URL, clicks it, revokes. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke: Safari needs the URL to live long enough for the
  // browser to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- private helpers below ----------------------------------------------

async function getContext(): Promise<ExportContext> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error('Sign in to export your data.');
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();
  return {
    userId,
    username: (prof as { username?: string | null } | null)?.username ?? null,
    exportedAt: new Date().toISOString()
  };
}

async function fetchPins(userId: string): Promise<PinRow[]> {
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('id, region_id, species_id, display_name, status, visibility, notes, access_status, location_accuracy_m, created_at, updated_at, lat, lng')
    .eq('created_by' as never, userId);
  if (error) throw error;
  return (data ?? []) as unknown as PinRow[];
}

async function fetchObservations(userId: string): Promise<ObsRow[]> {
  const { data, error } = await supabase
    .from('observations')
    .select('id, pin_id, stage, observed_at, observed_precision, quality_rating, quality_notes, visibility, created_at')
    .eq('created_by' as never, userId);
  if (error) throw error;
  return (data ?? []) as unknown as ObsRow[];
}

async function fetchPhotos(userId: string): Promise<Array<PhotoRow & { signed_url?: string; thumbnail_url?: string }>> {
  const { data, error } = await supabase
    .from('photos')
    .select('id, pin_id, observation_id, storage_path, thumbnail_path, caption, license, photographer_credit, captured_lat, captured_lng, captured_accuracy_m, created_at')
    .eq('uploader_id' as never, userId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PhotoRow[];
  if (rows.length === 0) return [];
  // Sign full + thumbnail paths so the user can curl them. URLs expire
  // in 1 hour — the README warns about this.
  const allPaths = [...rows.map((r) => r.storage_path), ...rows.map((r) => r.thumbnail_path)];
  const signed = await signUrls(allPaths, 3600);
  return rows.map((r) => ({
    ...r,
    signed_url: signed.get(r.storage_path),
    thumbnail_url: signed.get(r.thumbnail_path)
  }));
}

async function fetchTracks(userId: string): Promise<TrackRow[]> {
  const { data: tracks, error: tErr } = await supabase
    .from('tracks')
    .select('id, title, source, started_at, ended_at, total_distance_m, visibility, created_at')
    .eq('owner_id' as never, userId);
  if (tErr) throw tErr;
  const list = (tracks ?? []) as unknown as Omit<TrackRow, 'points'>[];
  if (list.length === 0) return [];
  const ids = list.map((t) => t.id);
  // track_points stores `location` as a PostGIS geography; the
  // v_track_point_lnglat view (or similar) projects it to lat/lng for
  // the client. Use a server-side RPC to get lat/lng + ordered by time.
  const { data: pts, error: pErr } = await supabase.rpc(
    'export_track_points' as never,
    { p_track_ids: ids } as never
  );
  if (pErr) {
    // RPC missing → fall back to plain rows + skip lat/lng (still useful
    // for listing track metadata).
    console.warn('[exportService] export_track_points RPC missing; tracks lose point geometry:', pErr);
    return list.map((t) => ({ ...t, points: [] }));
  }
  const byTrack = new Map<string, Array<{ lat: number; lng: number; recorded_at: string | null; elevation_m: number | null }>>();
  for (const row of (pts ?? []) as unknown as Array<{ track_id: string; lat: number; lng: number; recorded_at: string | null; elevation_m: number | null }>) {
    const arr = byTrack.get(row.track_id) ?? [];
    arr.push({ lat: row.lat, lng: row.lng, recorded_at: row.recorded_at, elevation_m: row.elevation_m });
    byTrack.set(row.track_id, arr);
  }
  return list.map((t) => ({ ...t, points: byTrack.get(t.id) ?? [] }));
}

async function fetchWatchlist(userId: string): Promise<WatchRow[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('id, species_id, pin_id, notify_email, notify_in_app, created_at')
    .eq('user_id' as never, userId);
  if (error) throw error;
  return (data ?? []) as unknown as WatchRow[];
}

// --- formatters ---------------------------------------------------------

function buildReadme(
  ctx: ExportContext,
  pins: PinRow[],
  obs: ObsRow[],
  photos: Array<PhotoRow & { signed_url?: string; thumbnail_url?: string }>,
  tracks: TrackRow[],
  watch: WatchRow[]
): string {
  return [
    `Forager — Personal data export`,
    `Generated: ${ctx.exportedAt}`,
    `User: ${ctx.username ? '@' + ctx.username : '(no username)'} (${ctx.userId})`,
    ``,
    `This bundle contains everything Forager has on file under your account.`,
    `Files included:`,
    ``,
    `  pins.geojson      ${pins.length} pins you've created. Standard GeoJSON;`,
    `                    opens in QGIS, Google Earth, mapping libraries.`,
    `                    Each Feature.properties carries species_id, status,`,
    `                    notes, etc.`,
    ``,
    `  observations.csv  ${obs.length} observation rows you've logged on those`,
    `                    pins (stage / date / quality / notes).`,
    ``,
    `  photos.csv        ${photos.length} photo records. Includes signed URLs`,
    `                    (signed_url, thumbnail_url) good for ~1 hour from`,
    `                    the export time. Re-export to refresh URLs, or save`,
    `                    the photos locally now if you want long-term copies.`,
    ``,
    `  tracks.geojson    ${tracks.length} tracks. Each Feature is a LineString`,
    `                    with the route's points; properties carry the`,
    `                    title, total distance, source (live / GPX import / KML).`,
    ``,
    `  watchlist.csv     ${watch.length} watchlist entries (species or specific`,
    `                    pins you're following for ripeness alerts).`,
    ``,
    `Why this exists: portability and trust. You should be able to leave`,
    `Forager with all your data — that's a baseline of any tool worth using.`,
    ``,
    `Format choices: GeoJSON for spatial data because every map tool reads it.`,
    `CSV for tabular records so they open in Excel / a text editor / pandas`,
    `without ceremony.`,
    ``,
    `Privacy note: this bundle includes your private + shared pins and your`,
    `notes. Treat it as sensitive — it's a record of where your foraging`,
    `spots are.`,
    ``
  ].join('\n');
}

function buildPinsGeoJSON(pins: PinRow[]) {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [p.lng, p.lat]
      },
      properties: {
        id: p.id,
        region_id: p.region_id,
        species_id: p.species_id,
        display_name: p.display_name,
        status: p.status,
        visibility: p.visibility,
        notes: p.notes,
        access_status: p.access_status,
        location_accuracy_m: p.location_accuracy_m,
        created_at: p.created_at,
        updated_at: p.updated_at
      }
    }))
  };
}

function buildTracksGeoJSON(tracks: TrackRow[]) {
  return {
    type: 'FeatureCollection',
    features: tracks.map((t) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: t.points.map((p) => [p.lng, p.lat])
      },
      properties: {
        id: t.id,
        title: t.title,
        source: t.source,
        started_at: t.started_at,
        ended_at: t.ended_at,
        total_distance_m: t.total_distance_m,
        visibility: t.visibility,
        created_at: t.created_at,
        point_count: t.points.length
      }
    }))
  };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCSV(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function buildObservationsCSV(obs: ObsRow[]): string {
  return rowsToCSV(
    obs as unknown as Array<Record<string, unknown>>,
    ['id', 'pin_id', 'stage', 'observed_at', 'observed_precision', 'quality_rating', 'quality_notes', 'visibility', 'created_at']
  );
}

function buildPhotosCSV(photos: Array<PhotoRow & { signed_url?: string; thumbnail_url?: string }>): string {
  return rowsToCSV(
    photos as unknown as Array<Record<string, unknown>>,
    ['id', 'pin_id', 'observation_id', 'storage_path', 'signed_url', 'thumbnail_path', 'thumbnail_url', 'caption', 'license', 'photographer_credit', 'captured_lat', 'captured_lng', 'captured_accuracy_m', 'created_at']
  );
}

function buildWatchlistCSV(watch: WatchRow[]): string {
  return rowsToCSV(
    watch as unknown as Array<Record<string, unknown>>,
    ['id', 'species_id', 'pin_id', 'notify_email', 'notify_in_app', 'created_at']
  );
}
