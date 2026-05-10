<!--
  UX-events dashboard. Admin-only.
  Surfaces what the uxTracker collects:
   - Total events / unique sessions over the last 24h / 7d / 30d
   - Per-event-name counts with sparklines
   - Recent events table for inspection
   - Quick filters by event name + date range

  No fancy charting — small inline SVG bars are enough at the volume
  this generates (Forager is small-scale).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { profile } from '$lib/stores/profile';
  import { supabase } from '$lib/supabase';

  interface UxEvent {
    id: number;
    user_id: string | null;
    session_id: string;
    event_name: string;
    props: Record<string, unknown>;
    page: string | null;
    viewport_w: number | null;
    viewport_h: number | null;
    user_agent: string | null;
    created_at: string;
  }

  let loading = true;
  let errorMsg = '';
  let isAdmin = false;

  // Filters
  let windowDays = 7;
  let eventNameFilter = '';

  // Data
  let events: UxEvent[] = [];
  let totals = { totalEvents: 0, uniqueSessions: 0, distinctEvents: 0 };
  let perEvent: Array<{ name: string; count: number; lastAt: string }> = [];
  let dailyByEvent: Map<string, number[]> = new Map();
  let recentByEvent: Map<string, UxEvent[]> = new Map();

  /** Bucket by day (UTC) over `windowDays`, returning [oldest...newest]. */
  function bucketDaily(rows: UxEvent[], days: number): Map<string, number[]> {
    const buckets = new Map<string, number[]>();
    const now = new Date();
    for (const r of rows) {
      const arr = buckets.get(r.event_name) ?? new Array<number>(days).fill(0);
      const d = new Date(r.created_at);
      const dayDiff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff >= 0 && dayDiff < days) {
        arr[days - 1 - dayDiff]++;
      }
      buckets.set(r.event_name, arr);
    }
    return buckets;
  }

  async function loadEvents() {
    loading = true;
    errorMsg = '';
    try {
      const since = new Date();
      since.setDate(since.getDate() - windowDays);
      let query = supabase
        .from('ux_events' as never)
        .select('*')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (eventNameFilter) {
        query = query.eq('event_name', eventNameFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      events = ((data ?? []) as unknown as UxEvent[]);

      // Totals
      const sessions = new Set<string>();
      const eventCounts = new Map<string, { count: number; lastAt: string }>();
      for (const e of events) {
        sessions.add(e.session_id);
        const cur = eventCounts.get(e.event_name);
        if (cur) {
          cur.count++;
          if (e.created_at > cur.lastAt) cur.lastAt = e.created_at;
        } else {
          eventCounts.set(e.event_name, { count: 1, lastAt: e.created_at });
        }
      }
      totals = {
        totalEvents: events.length,
        uniqueSessions: sessions.size,
        distinctEvents: eventCounts.size
      };
      perEvent = [...eventCounts.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.count - a.count);

      dailyByEvent = bucketDaily(events, Math.min(windowDays, 30));

      // Last 5 events per name for the "recent" view
      recentByEvent = new Map();
      for (const e of events) {
        const arr = recentByEvent.get(e.event_name) ?? [];
        if (arr.length < 5) {
          arr.push(e);
          recentByEvent.set(e.event_name, arr);
        }
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  onMount(async () => {
    if (!$profile) {
      goto('/login?next=/admin/ux-events');
      return;
    }
    isAdmin = !!$profile.is_global_admin;
    if (!isAdmin) return;
    await loadEvents();
  });

  function fmt(n: number): string { return n.toLocaleString(); }
  function fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }
  function sparkPath(values: number[]): string {
    if (values.length === 0) return '';
    const max = Math.max(...values, 1);
    const w = 100, h = 20;
    const stepX = w / Math.max(values.length - 1, 1);
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
      .join(' ');
  }
  function uaShort(ua: string | null): string {
    if (!ua) return '?';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh/i.test(ua)) return 'macOS';
    if (/Windows/i.test(ua)) return 'Win';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Other';
  }
</script>

<svelte:head><title>UX events · admin</title></svelte:head>

<header>
  <h1>UX events</h1>
  <span class="hint">Aggregated user-behavior log · client-side queue → public.ux_events · 90-day retention</span>
</header>

<main>
  {#if !$profile}
    <p class="muted">Loading…</p>
  {:else if !isAdmin}
    <p class="muted">Admin only.</p>
  {:else}
    <div class="controls">
      <label>
        Window:
        <select bind:value={windowDays} on:change={loadEvents}>
          <option value={1}>last 24h</option>
          <option value={7}>last 7 days</option>
          <option value={30}>last 30 days</option>
          <option value={90}>last 90 days</option>
        </select>
      </label>
      <label>
        Event name:
        <input
          bind:value={eventNameFilter}
          placeholder="all (e.g. locate_me_success)"
          list="event-names"
          on:change={loadEvents}
        />
        <datalist id="event-names">
          {#each perEvent as e}<option value={e.name}></option>{/each}
        </datalist>
      </label>
      <button on:click={loadEvents}>Reload</button>
    </div>

    {#if loading}
      <p class="muted">Loading events…</p>
    {:else if errorMsg}
      <p class="error">{errorMsg}</p>
    {:else}
      <section class="totals">
        <div class="stat"><span class="big">{fmt(totals.totalEvents)}</span><span class="lbl">events</span></div>
        <div class="stat"><span class="big">{fmt(totals.uniqueSessions)}</span><span class="lbl">unique sessions</span></div>
        <div class="stat"><span class="big">{fmt(totals.distinctEvents)}</span><span class="lbl">distinct event names</span></div>
      </section>

      <section class="per-event">
        <h2>Events by name</h2>
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Count</th>
              <th>Trend (per day)</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {#each perEvent as e}
              {@const series = dailyByEvent.get(e.name) ?? []}
              <tr>
                <td><code>{e.name}</code></td>
                <td class="num">{fmt(e.count)}</td>
                <td class="spark-cell">
                  <svg viewBox="0 0 100 20" width="100" height="20" preserveAspectRatio="none">
                    <path d={sparkPath(series)} stroke="#3a7d3a" stroke-width="1.5" fill="none" />
                  </svg>
                </td>
                <td class="muted small">{fmtDate(e.lastAt)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      <section class="recent">
        <h2>Recent events (latest 5 per name)</h2>
        {#each perEvent as e}
          {@const recent = recentByEvent.get(e.name) ?? []}
          <details>
            <summary><code>{e.name}</code> · {recent.length} samples</summary>
            <table class="recent-tbl">
              <thead>
                <tr><th>When</th><th>OS</th><th>Page</th><th>Props</th></tr>
              </thead>
              <tbody>
                {#each recent as r}
                  <tr>
                    <td class="small">{fmtDate(r.created_at)}</td>
                    <td>{uaShort(r.user_agent)}</td>
                    <td><code>{r.page ?? '-'}</code></td>
                    <td><code class="props">{JSON.stringify(r.props)}</code></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </details>
        {/each}
      </section>
    {/if}
  {/if}
</main>

<style>
  header {
    display: flex; align-items: center; gap: 0.6rem;
    padding: 0.6rem 1.25rem;
    border-bottom: 1px solid #e1e8e1;
    background: #fbfdfa;
  }
  header h1 { margin: 0; font-size: 1.1rem; color: #1f2a1f; }
  .hint { font-size: 0.78rem; color: #6b7a6b; margin-left: auto; }
  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1rem 1.25rem 4rem;
    color: #1f2a1f;
  }
  .muted { color: #6b7a6b; }
  .small { font-size: 0.78rem; }
  .error { color: #b03030; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .controls {
    display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .controls label { display: inline-flex; gap: 0.3rem; align-items: center; font-size: 0.85rem; }
  .controls input, .controls select {
    font-family: inherit; font-size: 0.85rem; padding: 0.2rem 0.4rem;
    border: 1px solid #c7d0c7; border-radius: 0.25rem;
  }
  .totals {
    display: flex; gap: 1rem; margin: 1rem 0;
  }
  .stat {
    display: flex; flex-direction: column;
    padding: 0.6rem 0.9rem;
    background: #f4f8f1; border: 1px solid #cfdcc6; border-radius: 0.4rem;
    min-width: 8rem;
  }
  .stat .big { font-size: 1.6rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat .lbl { font-size: 0.78rem; color: #6b7a6b; }
  .per-event { margin-top: 1.5rem; }
  .per-event h2, .recent h2 { font-size: 1rem; margin: 0 0 0.4rem; }
  table {
    width: 100%; border-collapse: collapse; font-size: 0.85rem;
  }
  th, td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid #eaf0e6; }
  th { font-weight: 600; color: #2a3a2a; background: #f4f8f1; }
  .spark-cell { width: 110px; }
  .recent { margin-top: 1.5rem; }
  details { margin-bottom: 0.4rem; padding: 0.4rem 0.6rem; background: #fbfdfa; border: 1px solid #e1e8e1; border-radius: 0.3rem; }
  summary { cursor: pointer; font-size: 0.85rem; }
  .recent-tbl { margin-top: 0.4rem; }
  .props { font-size: 0.72rem; color: #2a3a2a; word-break: break-all; }
  code { font-family: ui-monospace, Menlo, monospace; }
</style>
