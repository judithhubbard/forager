// Photo service: upload, list, sign URLs.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import { resizeImage } from '$lib/utils/imageResize';
import type { Database } from '$lib/database.types';

export type PhotoBase = Database['public']['Tables']['photos']['Row'];
/** Photo augmented with the uploader's username — fetched via a
 *  PostgREST embed in listByPin. Used for the "Photo by @<username>"
 *  attribution in the lightbox. */
export type Photo = PhotoBase & {
  uploader_username?: string | null;
};

/** Allowed license codes per the 20260506000010_photo_attribution.sql
 *  CHECK constraint. Keep this in sync with the SQL. */
export type PhotoLicense =
  | 'CC-BY-SA-4.0'
  | 'CC-BY-4.0'
  | 'CC-BY-NC-SA-4.0'
  | 'CC0'
  | 'all-rights-reserved';

export const DEFAULT_PHOTO_LICENSE: PhotoLicense = 'CC-BY-SA-4.0';

export interface UploadPhotoInput {
  pinId: string;
  /** Optional — attach to a specific observation. */
  observationId?: string | null;
  file: File;
  /** GPS captured at the moment of upload (PLAN §4.7). Pin's location is
   *  the recommended fallback when GPS is unavailable. */
  capturedLat: number | null;
  capturedLng: number | null;
  capturedAccuracyM?: number | null;
  caption?: string | null;
  /** Override "Photo by @<username>" for this image (e.g. a friend's
   *  photo). Owner is still the uploader; only the displayed credit
   *  changes. Null/empty → use the uploader's username. */
  photographerCredit?: string | null;
  /** License under which the photo is shared. Defaults to CC BY-SA 4.0
   *  (the default for the foraging commons). */
  license?: PhotoLicense;
}

export async function listByPin(pinId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('pin_id', pinId)
    .order('taken_at', { ascending: false });
  if (error) {
    console.error('[photoService] listByPin error:', error);
    throw error;
  }
  const rows = (data ?? []) as PhotoBase[];
  if (rows.length === 0) return [];
  // Second query for the uploader usernames. profiles.user_id ->
  // auth.users.id is a real FK so this is a clean lookup; embedding
  // it on photos doesn't work because photos.user_id also points at
  // auth.users (PostgREST can't choose between two indirect paths).
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  // profiles.id == auth.users.id (1:1 with the user). Same shape as
  // photos.user_id, so the lookup is direct.
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', ids);
  const usernameById = new Map<string, string | null>();
  for (const p of profs ?? []) usernameById.set(p.id, p.username);
  return rows.map((r) => ({
    ...r,
    uploader_username: usernameById.get(r.user_id) ?? null
  }));
}

/** Get signed URLs for an array of object paths in one call. */
export async function signUrls(
  paths: string[],
  expiresInSeconds = 3600
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrls(paths, expiresInSeconds);
  if (error) {
    console.error('[photoService] signUrls error:', error);
    throw error;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}

/** Upload a photo: resize, upload main+thumb, insert row. Returns photo id. */
export async function upload(input: UploadPhotoInput): Promise<string> {
  const id = uuidv4();
  const mainPath = `${id}.jpg`;
  const thumbPath = `${id}-thumb.jpg`;

  await enqueue({
    id,
    entityType: 'photo',
    op: 'insert',
    payload: { ...input, file: input.file.name }, // don't blow up the log
    exec: async () => {
      const main = await resizeImage(input.file, 1600, 0.85);
      const thumb = await resizeImage(input.file, 256, 0.8);

      const { error: e1 } = await supabase.storage
        .from('photos')
        .upload(mainPath, main, { contentType: 'image/jpeg', upsert: false });
      if (e1) throw e1;

      const { error: e2 } = await supabase.storage
        .from('photos')
        .upload(thumbPath, thumb, { contentType: 'image/jpeg', upsert: false });
      if (e2) {
        // best-effort cleanup of main
        await supabase.storage.from('photos').remove([mainPath]).catch(() => {});
        throw e2;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in.');

      const { error: e3 } = await supabase.from('photos').insert({
        id,
        pin_id: input.pinId,
        observation_id: input.observationId ?? null,
        user_id: userId,
        taken_at: new Date().toISOString(),
        captured_lat: input.capturedLat,
        captured_lng: input.capturedLng,
        captured_accuracy_m: input.capturedAccuracyM ?? null,
        storage_path: mainPath,
        thumbnail_path: thumbPath,
        caption: input.caption ?? null,
        photographer_credit: input.photographerCredit ?? null,
        license: input.license ?? DEFAULT_PHOTO_LICENSE
      });
      if (e3) {
        await supabase.storage.from('photos').remove([mainPath, thumbPath]).catch(() => {});
        console.error('[photoService] insert error:', e3);
        throw e3;
      }
    }
  });

  return id;
}

/** Delete a photo: remove storage objects + row. Goes through outbox so
 *  the deletion replays if offline. Owner-only via RLS. */
export async function remove(photo: Photo): Promise<void> {
  await enqueue({
    id: photo.id,
    entityType: 'photo',
    op: 'delete',
    payload: { id: photo.id, storage_path: photo.storage_path, thumbnail_path: photo.thumbnail_path },
    exec: async () => {
      // Storage cleanup is best-effort — the row delete is the source of
      // truth. If the storage objects are already gone, that's fine.
      await supabase.storage
        .from('photos')
        .remove(
          [photo.storage_path, photo.thumbnail_path].filter(
            (p): p is string => !!p
          )
        )
        .catch(() => {});
      const { error } = await supabase.from('photos').delete().eq('id', photo.id);
      if (error) {
        console.error('[photoService] remove error:', error);
        throw error;
      }
    }
  });
}

/** Cache of the last successful GPS reading. Photo uploads in quick
 *  succession from the same spot reuse it instead of re-asking the
 *  phone (which costs battery and 0-10s of latency per ask). 2-min
 *  staleness window — long enough for a typical "take 5 photos of
 *  one tree" burst, short enough that the user has barely walked. */
const GPS_CACHE_MS = 120_000;
let lastGpsReading: { lng: number; lat: number; accuracyM: number; at: number } | null = null;

/** GPS capture for photo upload (PLAN §B8). Falls back to pinFallback. */
export async function capturePhotoLocation(
  pinFallback: { lng: number; lat: number; accuracyM?: number | null }
): Promise<{ lng: number; lat: number; accuracyM: number | null; source: 'gps' | 'pin' }> {
  if (!navigator.geolocation) {
    return {
      lng: pinFallback.lng,
      lat: pinFallback.lat,
      accuracyM: pinFallback.accuracyM ?? null,
      source: 'pin'
    };
  }
  if (lastGpsReading && Date.now() - lastGpsReading.at < GPS_CACHE_MS) {
    return {
      lng: lastGpsReading.lng,
      lat: lastGpsReading.lat,
      accuracyM: lastGpsReading.accuracyM,
      source: 'gps'
    };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastGpsReading = {
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracyM: Math.round(pos.coords.accuracy),
          at: Date.now()
        };
        resolve({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracyM: Math.round(pos.coords.accuracy),
          source: 'gps'
        });
      },
      () =>
        resolve({
          lng: pinFallback.lng,
          lat: pinFallback.lat,
          accuracyM: pinFallback.accuracyM ?? null,
          source: 'pin'
        }),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  });
}
