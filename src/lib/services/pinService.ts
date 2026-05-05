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

/** Pins in a region, with computed effective status, ripe-now, and lng/lat. */
export async function listByRegion(regionId: string): Promise<PinEffective[]> {
  const { data, error } = await supabase
    .from('v_pin_effective')
    .select('*')
    .eq('region_id', regionId);

  if (error) {
    console.error('[pinService] listByRegion error:', error);
    throw error;
  }
  return data ?? [];
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
