// PLAN §10 C17: the single write path. All mutations go through the outbox,
// even when online. In Phase 1 the outbox flushes immediately (synchronous).
// Phase 3 will add IndexedDB queueing + retry-on-reconnect, swapping in a
// real persistence layer behind the same enqueue() API.

import { v4 as uuidv4 } from 'uuid';

export type OutboxOp = 'insert' | 'update' | 'delete';

export type OutboxEntityType =
  | 'pin'
  | 'observation'
  | 'photo'
  | 'hazard'
  | 'comment'
  | 'user_window_override'
  | 'region_seasonal_shift';

export interface OutboxJob {
  /** Stable client-generated UUID; doubles as idempotency key (PLAN §10 C16). */
  id: string;
  entityType: OutboxEntityType;
  op: OutboxOp;
  /** Domain-shaped payload. Whatever shape the service used. */
  payload: unknown;
  /** Phase 1: how to actually perform the write. Phase 3 will swap this for
   *  a registry lookup keyed on (entityType, op). */
  exec: () => Promise<void>;
}

export type EnqueueInput = Omit<OutboxJob, 'id'> & { id?: string };

/**
 * Enqueue a write. Phase 1 implementation flushes immediately; the function
 * resolves only after the underlying write completes (or throws on error).
 *
 * Phase 3 will: persist the job (sans `exec`) to IndexedDB, then call
 * `exec()`; on offline failure, the job stays in IndexedDB and gets
 * retried by a background flush worker on reconnect.
 */
export async function enqueue(input: EnqueueInput): Promise<OutboxJob> {
  const job: OutboxJob = { id: input.id ?? uuidv4(), ...input };
  await job.exec();
  return job;
}
