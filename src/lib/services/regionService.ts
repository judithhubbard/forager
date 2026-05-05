// Region service: list, fetch, and (eventually) create regions.
// Per PLAN §10 C18 + C26.

import { supabase } from '$lib/supabase';
import type { Database } from '$lib/database.types';

export type Region = Database['public']['Tables']['regions']['Row'];
export type RegionMembership = Database['public']['Tables']['region_memberships']['Row'];

export type MembershipRole = 'admin' | 'member';

export interface RegionWithRole extends Region {
  role: MembershipRole;
}

/** Regions the current authenticated user is a member of. */
export async function listMyRegions(): Promise<RegionWithRole[]> {
  const { data, error } = await supabase
    .from('region_memberships')
    .select('role, region:regions(*)')
    .order('joined_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data
    .filter((row) => row.region !== null)
    .map((row) => {
      const r = row.region as unknown as Region;
      return { ...r, role: row.role as MembershipRole };
    });
}

/** Single region by id (any region the user can read via RLS). */
export async function getRegion(id: string): Promise<Region | null> {
  const { data, error } = await supabase.from('regions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
