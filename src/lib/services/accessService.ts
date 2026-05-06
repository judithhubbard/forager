// Access-status service. Phase 1E (PLAN.md). Owns the new
// pins.access_status column — single value per pin describing the
// access situation at the location.
//
// Decoupled from hazardService because access is a property of the
// place, not a per-observation safety annotation. A pin has at most
// one access_status; it can have many safety hazards.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

export type AccessStatus = Database['public']['Enums']['access_status'];

export const ACCESS_STATUSES: AccessStatus[] = [
  'public_land',
  'private_with_permission',
  'private_no_permission',
  'fenced',
  'posted',
  'unmaintained',
  'dangerous_access'
];

export const ACCESS_LABELS: Record<AccessStatus, string> = {
  public_land:             'Public land',
  private_with_permission: 'Private — have permission',
  private_no_permission:   'Private — ask first',
  fenced:                  'Fenced / gated',
  posted:                  'Posted (no trespassing)',
  unmaintained:            'Unmaintained / hard to reach',
  dangerous_access:        'Dangerous access'
};

export const ACCESS_EMOJI: Record<AccessStatus, string> = {
  public_land:             '🏞',
  private_with_permission: '🤝',
  private_no_permission:   '🚷',
  fenced:                  '🔒',
  posted:                  '⛔',
  unmaintained:            '🌿',
  dangerous_access:        '⚠️'
};

/** Update a pin's access_status. RLS lets owner + region admin write. */
export async function setStatus(
  pinId: string,
  status: AccessStatus | null
): Promise<void> {
  const { error } = await supabase
    .from('pins')
    .update({ access_status: status })
    .eq('id', pinId);
  if (error) {
    console.error('[accessService] setStatus error:', error);
    throw error;
  }
}
