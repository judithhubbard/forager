// User feedback / report submission. Backed by feedback_reports
// (migration 75). The service is the only place that talks to the
// table; pages call submit() and don't touch the schema.

import { supabase } from '$lib/supabase';

export type FeedbackCategory =
  | 'suggestion'
  | 'error'
  | 'misuse'
  | 'data_source'
  | 'feature_request'
  | 'other';

export const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; hint: string }[] = [
  { value: 'feature_request', label: 'Feature request',     hint: 'Something you wish the app did' },
  { value: 'suggestion',      label: 'Suggestion',          hint: 'Improvements to existing features' },
  { value: 'error',           label: 'Data error',          hint: 'A pin in the wrong place, mislabeled species, etc.' },
  { value: 'data_source',     label: 'New data source',     hint: 'A city / arboretum / dataset to add' },
  { value: 'misuse',          label: 'Community misuse',    hint: 'Inappropriate content or behavior to flag' },
  { value: 'other',           label: 'Other',               hint: 'Anything else' }
];

export interface FeedbackInput {
  category: FeedbackCategory;
  subject: string;
  body: string;
  contextPinId?: string | null;
  contextRegionId?: string | null;
  contextUrl?: string;
}

export async function submit(input: FeedbackInput): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;

  const { error } = await supabase
    .from('feedback_reports' as never)
    .insert({
      reporter_id: userId,
      category: input.category,
      subject: input.subject.trim(),
      body: input.body.trim(),
      context_pin_id: input.contextPinId ?? null,
      context_region_id: input.contextRegionId ?? null,
      context_url: input.contextUrl ?? null
    } as never);
  if (error) {
    console.error('[feedbackService] submit error:', error);
    throw error;
  }
}

export interface FeedbackRow {
  id: string;
  reporter_id: string | null;
  category: FeedbackCategory;
  subject: string;
  body: string;
  context_pin_id: string | null;
  context_region_id: string | null;
  context_url: string | null;
  status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'wontfix';
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Admin: list every report. Non-admins are RLS-rejected. */
export async function listAll(): Promise<FeedbackRow[]> {
  const { data, error } = await supabase
    .from('feedback_reports' as never)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FeedbackRow[];
}

/** Admin: update status / notes. */
export async function updateRow(
  id: string,
  patch: Partial<Pick<FeedbackRow, 'status' | 'admin_notes'>>
): Promise<void> {
  const { error } = await supabase
    .from('feedback_reports' as never)
    .update(patch as never)
    .eq('id', id);
  if (error) throw error;
}
