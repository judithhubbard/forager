<script lang="ts">
  // Global-admin-only viewer for submitted feedback. RLS gates SELECT
  // (only global admins can see other users' rows), so a non-admin
  // hitting this page will get an empty list — but we also redirect
  // explicitly for clarity.

  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { profile } from '$lib/stores/profile';
  import {
    listAll,
    updateRow,
    FEEDBACK_CATEGORIES,
    type FeedbackRow
  } from '$lib/services/feedbackService';

  let rows: FeedbackRow[] = [];
  let loading = true;
  let errorMessage = '';
  let busyId: string | null = null;
  let filterStatus: 'all' | 'open' | 'resolved' = 'open';

  $: visible = rows.filter((r) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'resolved') return r.status === 'resolved' || r.status === 'wontfix';
    return r.status === 'new' || r.status === 'acknowledged' || r.status === 'in_progress';
  });

  $: counts = {
    open: rows.filter((r) => r.status === 'new' || r.status === 'acknowledged' || r.status === 'in_progress').length,
    all: rows.length,
    resolved: rows.filter((r) => r.status === 'resolved' || r.status === 'wontfix').length
  };

  onMount(() => {
    load();
  });

  $: if ($profile && $profile.is_global_admin !== true) {
    goto('/', { replaceState: true });
  }

  async function load() {
    loading = true;
    errorMessage = '';
    try {
      rows = await listAll();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  }

  async function setStatus(id: string, status: FeedbackRow['status']) {
    if (busyId) return;
    busyId = id;
    try {
      await updateRow(id, { status });
      const r = rows.find((x) => x.id === id);
      if (r) {
        r.status = status;
        r.resolved_at = (status === 'resolved' || status === 'wontfix') ? new Date().toISOString() : null;
        rows = [...rows]; // trigger reactivity
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Update failed.';
    } finally {
      busyId = null;
    }
  }

  function categoryLabel(c: FeedbackRow['category']): string {
    return FEEDBACK_CATEGORIES.find((x) => x.value === c)?.label ?? c;
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  const STATUSES: FeedbackRow['status'][] = ['new', 'acknowledged', 'in_progress', 'resolved', 'wontfix'];
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Feedback inbox</h1>
</header>

<main>
  {#if errorMessage}<p class="error">{errorMessage}</p>{/if}
  <div class="filter-row">
    <label>
      <input type="radio" bind:group={filterStatus} value="open" />
      Open <span class="count">({counts.open})</span>
    </label>
    <label>
      <input type="radio" bind:group={filterStatus} value="resolved" />
      Resolved <span class="count">({counts.resolved})</span>
    </label>
    <label>
      <input type="radio" bind:group={filterStatus} value="all" />
      All <span class="count">({counts.all})</span>
    </label>
    <button class="reload" on:click={load} disabled={loading}>
      {loading ? '…' : '↻ Refresh'}
    </button>
  </div>
  {#if loading && rows.length === 0}
    <p class="hint">Loading…</p>
  {:else if visible.length === 0}
    <p class="hint">Nothing in this view.</p>
  {:else}
    <ul class="reports">
      {#each visible as r (r.id)}
        <li class="report" class:resolved={r.status === 'resolved' || r.status === 'wontfix'}>
          <div class="report-head">
            <span class="cat-chip">{categoryLabel(r.category)}</span>
            <strong class="subj">{r.subject}</strong>
            <span class="status status-{r.status}">{r.status.replace('_', ' ')}</span>
          </div>
          <p class="body">{r.body}</p>
          <div class="meta">
            <span>{fmtDate(r.created_at)}</span>
            {#if r.reporter_id}
              <span>· user <code>{r.reporter_id.slice(0, 8)}</code></span>
            {:else}
              <span>· anon</span>
            {/if}
            {#if r.context_url}
              <span>· <a href={r.context_url} target="_blank" rel="noopener noreferrer">{r.context_url}</a></span>
            {/if}
            {#if r.context_pin_id}
              <span>· pin <code>{r.context_pin_id.slice(0, 8)}</code></span>
            {/if}
          </div>
          <div class="actions">
            {#each STATUSES as s}
              {#if s !== r.status}
                <button
                  on:click={() => setStatus(r.id, s)}
                  disabled={busyId === r.id}
                >→ {s.replace('_', ' ')}</button>
              {/if}
            {/each}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px;
    box-sizing: border-box;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
  main {
    max-width: 48rem;
    margin: 1rem auto 4rem;
    padding: 0 1rem;
    color: #1f2a1f;
  }
  .error { color: #b03030; font-size: 0.9rem; }
  .hint { color: #6b7a6b; font-size: 0.92rem; }
  .filter-row {
    display: flex;
    gap: 0.85rem;
    align-items: center;
    margin-bottom: 0.85rem;
    font-size: 0.92rem;
    color: #4a554a;
  }
  .filter-row label { display: flex; gap: 0.3rem; align-items: center; cursor: pointer; }
  .count { color: #6b7a6b; font-size: 0.85rem; }
  .reload {
    margin-left: auto;
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    padding: 0.3rem 0.7rem;
    border-radius: 0.3rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .reload:hover { background: #f0f5ef; }
  .reports {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .report {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    padding: 0.7rem 0.85rem;
  }
  .report.resolved { opacity: 0.65; }
  .report-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .cat-chip {
    background: #e6ede6;
    color: #3a5a3a;
    padding: 0.15rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.78rem;
    font-weight: 600;
  }
  .subj { color: #1f2a1f; font-size: 0.95rem; flex: 1; }
  .status {
    margin-left: auto;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    background: #e6ede6;
    color: #3a5a3a;
    text-transform: capitalize;
  }
  .status-new { background: #ffe9c0; color: #7a4a10; }
  .status-acknowledged { background: #e0e9f0; color: #2a4a6a; }
  .status-in_progress { background: #e0f0e8; color: #1f5a3a; }
  .status-resolved { background: #d6e8d4; color: #3a5a3a; }
  .status-wontfix { background: #f0d6d6; color: #6a3a3a; }
  .body {
    margin: 0.4rem 0;
    color: #2a322a;
    font-size: 0.92rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .meta {
    margin: 0.5rem 0 0.4rem;
    font-size: 0.78rem;
    color: #6b7a6b;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .meta a { color: #3a5a3a; }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.4rem;
  }
  .actions button {
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    padding: 0.2rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.78rem;
  }
  .actions button:hover { background: #f0f5ef; }
  .actions button:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
