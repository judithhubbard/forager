// Pin service: read & write operations against the pins table / v_pin_effective view.
// Per PLAN §10 C18, components import from here, not from the raw client.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

export type Pin = Database['public']['Tables']['pins']['Row'];
export type PinInsert = Database['public']['Tables']['pins']['Insert'];
export type PinEffective = Database['public']['Views']['v_pin_effective']['Row'];
export type PinStatus = Database['public']['Enums']['pin_status'];

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
