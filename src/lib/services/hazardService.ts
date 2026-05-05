// Hazard service: list, add, remove hazard tags on a pin.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import type { Database } from '$lib/database.types';

export type Hazard = Database['public']['Tables']['hazards']['Row'];
export type HazardType = Database['public']['Enums']['hazard_type'];

export const HAZARD_TYPES: HazardType[] = [
  // Plant condition
  'sick',
  // Safety
  'poison_ivy',
  'ticks',
  'unstable_terrain',
  'water_crossing',
  'traffic',
  // Access
  'out_of_reach',
  'inaccessible',
  'fenced',
  'private_property',
  // Catch-all
  'other'
];

export const HAZARD_LABELS: Record<HazardType, string> = {
  sick: 'Sick / diseased (rust, canker, blight)',
  poison_ivy: 'Poison ivy',
  ticks: 'Ticks',
  unstable_terrain: 'Unstable terrain',
  water_crossing: 'Water crossing',
  traffic: 'Traffic',
  out_of_reach: 'Out of reach (too tall)',
  inaccessible: 'Inaccessible',
  fenced: 'Fenced / gated',
  private_property: 'Private property — ask first',
  other: 'Other'
};

export const HAZARD_EMOJI: Record<HazardType, string> = {
  sick: '🩹',
  poison_ivy: '🌿',
  ticks: '🕷',
  unstable_terrain: '⛰',
  water_crossing: '💧',
  traffic: '🚗',
  out_of_reach: '📏',
  inaccessible: '🚧',
  fenced: '🔒',
  private_property: '🚷',
  other: '⚠'
};

export async function listByPin(pinId: string): Promise<Hazard[]> {
  const { data, error } = await supabase
    .from('hazards')
    .select('*')
    .eq('pin_id', pinId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[hazardService] listByPin error:', error);
    throw error;
  }
  return data ?? [];
}

export interface CreateHazardInput {
  pinId: string;
  hazardType: HazardType;
  notes?: string | null;
}

export async function create(input: CreateHazardInput): Promise<string> {
  const id = uuidv4();
  await enqueue({
    id,
    entityType: 'hazard',
    op: 'insert',
    payload: input,
    exec: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in.');

      const { error } = await supabase.from('hazards').insert({
        id,
        pin_id: input.pinId,
        user_id: userId,
        hazard_type: input.hazardType,
        notes: input.notes ?? null
      });
      if (error) {
        console.error('[hazardService] create error:', error);
        throw error;
      }
    }
  });
  return id;
}

export async function remove(id: string): Promise<void> {
  await enqueue({
    id,
    entityType: 'hazard',
    op: 'delete',
    payload: { id },
    exec: async () => {
      const { error } = await supabase.from('hazards').delete().eq('id', id);
      if (error) {
        console.error('[hazardService] remove error:', error);
        throw error;
      }
    }
  });
}
