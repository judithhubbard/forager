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

  if (error) {
    console.error('[regionService] listMyRegions error:', error);
    throw error;
  }
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

/** Create a new region with the caller as admin. Goes through the
 *  create_region RPC so the regions row + region_memberships row land
 *  in the same transaction. Returns the new region id so the caller
 *  can switch to it. */
export async function createRegion(input: {
  name: string;
  defaultPinVisibility?: 'shared' | 'private';
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_region', {
    p_name: input.name,
    p_default_pin_visibility: input.defaultPinVisibility ?? 'shared'
  });
  if (error) {
    console.error('[regionService] createRegion error:', error);
    throw error;
  }
  if (!data) throw new Error('Region creation returned no id');
  return data;
}
