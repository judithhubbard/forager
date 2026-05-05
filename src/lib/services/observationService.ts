// Observation service: list and create observations on a pin.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import type { Database } from '$lib/database.types';

export type Observation = Database['public']['Tables']['observations']['Row'];
export type Stage = Database['public']['Enums']['stage'];

export const STAGES: Stage[] = [
  'flowering',
  'green',
  'ripening',
  'ripe',
  'past',
  'bare',
  'unknown'
];

export interface CreateObservationInput {
  pinId: string;
  stage: Stage;
  qualityRating?: number | null;
  qualityNotes?: string | null;
  observedAt?: Date;
}

export async function listByPin(pinId: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from('observations')
    .select('*')
    .eq('pin_id', pinId)
    .order('observed_at', { ascending: false });
  if (error) {
    console.error('[observationService] listByPin error:', error);
    throw error;
  }
  return data ?? [];
}

export async function create(input: CreateObservationInput): Promise<string> {
  const id = uuidv4();
  await enqueue({
    id,
    entityType: 'observation',
    op: 'insert',
    payload: input,
    exec: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in.');

      const { error } = await supabase.from('observations').insert({
        id,
        pin_id: input.pinId,
        user_id: userId,
        stage: input.stage,
        quality_rating: input.qualityRating ?? null,
        quality_notes: input.qualityNotes ?? null,
        observed_at: (input.observedAt ?? new Date()).toISOString()
      });
      if (error) {
        console.error('[observationService] create error:', error);
        throw error;
      }
    }
  });
  return id;
}

/** Group observations by year for the year-over-year UI (PLAN §3.4). */
export function groupByYear(obs: Observation[]): Map<number, Observation[]> {
  const out = new Map<number, Observation[]>();
  for (const o of obs) {
    const yr = new Date(o.observed_at).getFullYear();
    const list = out.get(yr) ?? [];
    list.push(o);
    out.set(yr, list);
  }
  return out;
}
