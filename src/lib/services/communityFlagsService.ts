// Community flag layer: lets authed users mark a public pin as
// "gone", "wrong species", "inaccessible", or "low quality". Aggregate
// flag counts drive the visibility-affecting score on pins; a few
// distinct users agreeing greys / hides a pin from the default view.
//
// Per-pin flag listing returns counts by type, plus whether the
// current user has already flagged. Insert dedupes via the unique
// constraint (pin_id, flagged_by, flag_type).

import { supabase } from '$lib/supabase';

export type FlagType = 'gone' | 'wrong_species' | 'inaccessible' | 'low_quality';

export const FLAG_LABELS: Record<FlagType, string> = {
  gone: 'Gone',
  wrong_species: 'Wrong species',
  inaccessible: 'Inaccessible',
  low_quality: 'Poor quality'
};

export interface FlagCounts {
  /** Total distinct users who flagged each type. */
  byType: Record<FlagType, number>;
  /** Flag types this user has already submitted on this pin. */
  mine: Set<FlagType>;
}

// pin_community_flags landed in migration 37 — generated Database
// types haven't been regenerated, so the table-name cast through
// `never` is the documented escape hatch (same pattern as
// region_pins_bbox in pinService.ts).
type FlagRow = { flag_type: FlagType; flagged_by: string };

export async function listForPin(pinId: string): Promise<FlagCounts> {
  const { data, error } = await supabase
    .from('pin_community_flags' as never)
    .select('flag_type, flagged_by')
    .eq('pin_id' as never, pinId);
  if (error) {
    console.error('[communityFlags] listForPin error:', error);
    throw error;
  }
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id ?? null;
  const byType: Record<FlagType, number> = {
    gone: 0, wrong_species: 0, inaccessible: 0, low_quality: 0
  };
  const mine = new Set<FlagType>();
  for (const r of (data ?? []) as unknown as FlagRow[]) {
    byType[r.flag_type]++;
    if (myId && r.flagged_by === myId) mine.add(r.flag_type);
  }
  return { byType, mine };
}

export async function add(pinId: string, type: FlagType, note?: string): Promise<void> {
  const { data: userData, error: ue } = await supabase.auth.getUser();
  if (ue || !userData.user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('pin_community_flags' as never)
    .insert({
      pin_id: pinId,
      flagged_by: userData.user.id,
      flag_type: type,
      note: note ?? null
    } as never);
  if (error) {
    console.error('[communityFlags] add error:', error);
    throw error;
  }
}

export async function remove(pinId: string, type: FlagType): Promise<void> {
  const { data: userData, error: ue } = await supabase.auth.getUser();
  if (ue || !userData.user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('pin_community_flags' as never)
    .delete()
    .eq('pin_id' as never, pinId)
    .eq('flagged_by' as never, userData.user.id)
    .eq('flag_type' as never, type);
  if (error) {
    console.error('[communityFlags] remove error:', error);
    throw error;
  }
}
