// Pin service: read & write operations against the pins table / v_pin_effective view.
// Per PLAN §10 C18, components import from here, not from the raw client.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import type { Database } from '$lib/database.types';

export type Pin = Database['public']['Tables']['pins']['Row'];
export type PinInsert = Database['public']['Tables']['pins']['Insert'];
export type PinEffective = Database['public']['Views']['v_pin_effective']['Row'];
export type PinStatus = Database['public']['Enums']['pin_status'];

export interface CreatePinInput {
  regionId: string;
  /** Required in v1 (species picker enforces it). "Unknown" species is a v1.x add. */
  speciesId: string;
  lng: number;
  lat: number;
  locationAccuracyM?: number | null;
  displayName?: string | null;
  notes?: string | null;
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
        p_status?: 'active' | 'gone' | 'dormant' | 'needs_verification';
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

      const { error } = await supabase.rpc('insert_pin', args);
      if (error) {
        console.error('[pinService] create error:', error);
        throw error;
      }
    }
  });
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

/** Haversine distance between two lng/lat points in meters. */
export function haversineMeters(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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
}
