// Observation service: list and create observations on a pin.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import type { Database } from '$lib/database.types';

export type Observation = Database['public']['Tables']['observations']['Row'];
export type ObservationWithPin = Database['public']['Views']['v_observation_with_pin']['Row'];
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

export type ObservationPrecision = 'year' | 'month' | 'day';

export interface CreateObservationInput {
  pinId: string;
  stage: Stage;
  qualityRating?: number | null;
  qualityNotes?: string | null;
  observedAt?: Date;
  observedPrecision?: ObservationPrecision;
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

/** Recent observations across a region, newest first. For the activity feed. */
export async function listRecentInRegion(
  regionId: string,
  limit = 100
): Promise<ObservationWithPin[]> {
  const { data, error } = await supabase
    .from('v_observation_with_pin')
    .select('*')
    .eq('pin_region_id', regionId)
    .order('observed_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[observationService] listRecentInRegion error:', error);
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
        observed_at: (input.observedAt ?? new Date()).toISOString(),
        observed_precision: input.observedPrecision ?? 'day'
      });
      if (error) {
        console.error('[observationService] create error:', error);
        throw error;
      }
    }
  });
  return id;
}

/** Delete an observation by id. RLS allows owners to delete their own. */
export async function remove(id: string): Promise<void> {
  await enqueue({
    id,
    entityType: 'observation',
    op: 'delete',
    payload: { id },
    exec: async () => {
      const { error } = await supabase.from('observations').delete().eq('id', id);
      if (error) {
        console.error('[observationService] remove error:', error);
        throw error;
      }
    }
  });
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
