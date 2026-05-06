// Region membership management — used by the admin portal.
//
// Listing leans on the FK from region_memberships.user_id → profiles.id
// (added in the admin-portal migration) so PostgREST embeds the
// profile in the same query. RLS already gates the table to
// co-members for SELECT and admins for UPDATE/DELETE.

import { supabase } from '$lib/supabase';
import type { MembershipRole } from './regionService';

export interface MemberRow {
  user_id: string;
  region_id: string;
  role: MembershipRole;
  joined_at: string;
  username: string | null;
  display_name: string | null;
}

export async function listMembers(regionId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('region_memberships')
    .select(
      'user_id, region_id, role, joined_at, profile:profiles!region_memberships_user_id_profile_fkey(username, display_name)'
    )
    .eq('region_id', regionId)
    .order('role', { ascending: true })
    .order('joined_at', { ascending: true });
  if (error) {
    console.error('[membershipService] listMembers error:', error);
    throw error;
  }
  type Row = {
    user_id: string;
    region_id: string;
    role: MembershipRole;
    joined_at: string;
    profile: { username: string | null; display_name: string | null } | null;
  };
  // Cast via unknown — FK is new (20260506000001), types lag.
  return ((data as unknown as Row[] | null) ?? []).map((r) => ({
    user_id: r.user_id,
    region_id: r.region_id,
    role: r.role,
    joined_at: r.joined_at,
    username: r.profile?.username ?? null,
    display_name: r.profile?.display_name ?? null
  }));
}

export async function updateRole(
  regionId: string,
  userId: string,
  role: MembershipRole
): Promise<void> {
  const { error } = await supabase
    .from('region_memberships')
    .update({ role })
    .eq('region_id', regionId)
    .eq('user_id', userId);
  if (error) {
    console.error('[membershipService] updateRole error:', error);
    throw error;
  }
}

export async function removeMember(regionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('region_memberships')
    .delete()
    .eq('region_id', regionId)
    .eq('user_id', userId);
  if (error) {
    console.error('[membershipService] removeMember error:', error);
    throw error;
  }
}
