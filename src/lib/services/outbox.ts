// PLAN §10 C17: the single write path. All mutations go through the outbox,
// even when online. In Phase 1 the outbox flushes immediately and synchronously;
// Phase 3 adds offline queueing in IndexedDB.
//
// Per-entity service modules (pinService, observationService, etc.) call
// `enqueue()` rather than calling Supabase directly. This keeps online and
// offline code paths identical.

export type OutboxOp = 'insert' | 'update' | 'delete';

export type OutboxEntityType =
  | 'pin'
  | 'observation'
  | 'photo'
  | 'hazard'
  | 'comment'
  | 'user_window_override'
  | 'region_seasonal_shift';

export interface OutboxEntry {
  /** Client-generated UUID, doubles as idempotency key (PLAN §10 C16). */
  id: string;
  entityType: OutboxEntityType;
  op: OutboxOp;
  /** Domain-shaped payload; the entity service knows how to apply it. */
  payload: unknown;
  createdAt: string;
}

// Phase 1 will provide a real implementation: enqueue → immediate flush → service call.
// Phase 3 will replace the immediate flush with an IndexedDB queue + retry on reconnect.

export async function enqueue(_entry: Omit<OutboxEntry, 'createdAt'>): Promise<void> {
  throw new Error('outbox.enqueue not implemented yet — see PLAN §10 C17 (Phase 1).');
}

export async function flush(): Promise<void> {
  throw new Error('outbox.flush not implemented yet — see PLAN §10 C17 (Phase 1).');
}
