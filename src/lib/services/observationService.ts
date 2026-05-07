// Observation service: list and create observations on a pin.

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '$lib/supabase';
import { enqueue } from './outbox';
import { bumpDataChange, bumpPinChanged } from '$lib/stores/dataChange';
import type { Database } from '$lib/database.types';

export type Observation = Database['public']['Tables']['observations']['Row'];

/** Observation row decorated with the author's username/display_name
 *  and explicit visibility (already on the base row, just keeping it
 *  in the type for clarity at call sites). */
export type ObservationWithUser = Observation & {
  user_username: string | null;
  user_display_name: string | null;
};
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
  /** Defaults to 'shared'. Mark 'private' to keep this observation
   *  visible only to the author (e.g. detailed harvest notes you
   *  don't want to share with the group). */
  visibility?: 'shared' | 'private';
}

export async function listByPin(pinId: string): Promise<ObservationWithUser[]> {
  // Embed profile attribution via the observations.user_id → profiles.id
  // FK added in the admin-portal migration. Hint by FK constraint name
  // so PostgREST picks the profiles relationship (the user_id column
  // also has an FK to auth.users that we don't want to follow).
  const { data, error } = await supabase
    .from('observations')
    .select('*, author:profiles!observations_user_id_profile_fkey(username, display_name)')
    .eq('pin_id', pinId)
    .order('observed_at', { ascending: false });
  if (error) {
    console.error('[observationService] listByPin error:', error);
    throw error;
  }
  type Row = Observation & {
    author: { username: string | null; display_name: string | null } | null;
  };
  // Cast via unknown — the FK was added in 20260506000001 but the
  // generated types lag behind real schema until regenerated.
  return ((data as unknown as Row[] | null) ?? []).map((r) => {
    const { author, ...rest } = r;
    return {
      ...rest,
      user_username: author?.username ?? null,
      user_display_name: author?.display_name ?? null
    };
  });
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
        observed_precision: input.observedPrecision ?? 'day',
        visibility: input.visibility ?? 'shared'
      });
      if (error) {
        console.error('[observationService] create error:', error);
        throw error;
      }
    }
  });
  bumpPinChanged(input.pinId);
  return id;
}

/** Delete an observation by id. RLS allows owners to delete their own.
 *  Pass pinId when known (the pin-detail panel has it from the row)
 *  so the page can refresh just that one pin instead of the whole
 *  region. Falls back to a coarse data-change bump otherwise. */
export async function remove(id: string, pinId?: string): Promise<void> {
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
  if (pinId) bumpPinChanged(pinId);
  else bumpDataChange();
}

/** Group observations by year for the year-over-year UI (PLAN §3.4). */
export function groupByYear<T extends { observed_at: string }>(
  obs: T[]
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const o of obs) {
    const yr = new Date(o.observed_at).getFullYear();
    const list = out.get(yr) ?? [];
    list.push(o);
    out.set(yr, list);
  }
  return out;
}
