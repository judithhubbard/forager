<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listMine,
    importTrackFile,
    remove,
    updateMeta,
    type TrackRow
  } from '$lib/services/trackService';
  import {
    displayedTrackIds,
    showTrack,
    hideTrack
  } from '$lib/stores/displayedTracks';
  import { settings, setShowHeatmap } from '$lib/stores/settings';

  let tracks: TrackRow[] = [];
  let loading = true;
  let error = '';
  let uploading = false;
  let uploadError = '';
  let fileInput: HTMLInputElement;

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      tracks = await listMine();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load tracks.';
    } finally {
      loading = false;
    }
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;
    uploading = true;
    uploadError = '';
    try {
      for (const file of files) {
        await importTrackFile(file, {
          regionId: $activeRegion?.id ?? null
        });
      }
      await load();
    } catch (e) {
      uploadError = e instanceof Error ? e.message : 'Upload failed.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }

  function onShowToggle(e: Event, trackId: string) {
    if ((e.currentTarget as HTMLInputElement).checked) showTrack(trackId);
    else hideTrack(trackId);
  }

  async function onDelete(t: TrackRow) {
    if (!confirm(`Delete "${t.title ?? 'this track'}"? This cannot be undone.`)) return;
    try {
      await remove(t.id);
      tracks = tracks.filter((x) => x.id !== t.id);
      hideTrack(t.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed.';
    }
  }

  /** Inline rename. editingId tracks which row's title is editable;
   *  draftTitle is the in-flight value. Submit on Enter or on blur,
   *  cancel on Escape. */
  let editingId: string | null = null;
  let draftTitle = '';
  function startRename(t: TrackRow) {
    editingId = t.id;
    draftTitle = t.title ?? '';
  }
  function cancelRename() {
    editingId = null;
    draftTitle = '';
  }
  async function commitRename(t: TrackRow) {
    const next = draftTitle.trim();
    if (!next || next === (t.title ?? '')) {
      cancelRename();
      return;
    }
    try {
      await updateMeta(t.id, { title: next });
      tracks = tracks.map((x) => (x.id === t.id ? { ...x, title: next } : x));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Rename failed.';
    } finally {
      cancelRename();
    }
  }
  function onTitleKey(e: KeyboardEvent, t: TrackRow) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRename(t);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  }

  /** Toggle the per-track favorite flag. Optimistic local update;
   *  reverts to the prior value if the server write fails. */
  async function toggleFavorite(t: TrackRow) {
    const next = !t.is_favorite;
    tracks = tracks.map((x) => (x.id === t.id ? { ...x, is_favorite: next } : x));
    try {
      await updateMeta(t.id, { is_favorite: next });
    } catch (e) {
      tracks = tracks.map((x) => (x.id === t.id ? { ...x, is_favorite: !next } : x));
      error = e instanceof Error ? e.message : 'Could not update favorite.';
    }
  }

  /** Svelte action to focus an element when it mounts. Replaces the
   *  raw autofocus attribute (which trips an a11y warning). */
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  /** Date-range chip. Selecting a chip both filters the visible list
   *  AND syncs the on-map displayedTrackIds to that subset — the
   *  user wanted one button to control both 'which tracks am I
   *  looking at here' and 'which tracks paint on the map.' */
  type DateFilter = 'all' | '24h' | '7d' | '30d' | 'year' | 'favorites';
  const FILTER_OPTIONS: { k: DateFilter; label: string }[] = [
    { k: 'all',       label: 'All' },
    { k: '24h',       label: '24h' },
    { k: '7d',        label: '7 days' },
    { k: '30d',       label: '30 days' },
    { k: 'year',      label: 'Year' },
    { k: 'favorites', label: '★ Favorites' }
  ];
  const FILTER_MS: Record<'24h' | '7d' | '30d' | 'year', number> = {
    '24h':  24 * 60 * 60 * 1000,
    '7d':   7 * 24 * 60 * 60 * 1000,
    '30d':  30 * 24 * 60 * 60 * 1000,
    'year': 365 * 24 * 60 * 60 * 1000
  };
  let dateFilter: DateFilter = 'all';
  let lastSyncedFilter: DateFilter | null = null;

  $: filteredTracks = (() => {
    if (dateFilter === 'all') return tracks;
    if (dateFilter === 'favorites') return tracks.filter((t) => t.is_favorite);
    const cutoff = Date.now() - FILTER_MS[dateFilter];
    return tracks.filter((t) => {
      const ts = t.started_at ? new Date(t.started_at).getTime() : NaN;
      return Number.isFinite(ts) && ts >= cutoff;
    });
  })();

  /** When the user picks a chip, sync displayedTrackIds: show all
   *  tracks in the new filter, hide the rest. Re-applies on every
   *  chip change. The lastSyncedFilter guard lets a user manually
   *  toggle individual rows after picking a chip without those
   *  toggles being immediately overwritten. */
  $: if (
    !loading &&
    tracks.length > 0 &&
    dateFilter !== lastSyncedFilter
  ) {
    lastSyncedFilter = dateFilter;
    const wantedIds = new Set(filteredTracks.map((t) => t.id));
    for (const t of tracks) {
      if (wantedIds.has(t.id)) showTrack(t.id);
      else hideTrack(t.id);
    }
  }

  /** Group filtered tracks by month-year, in date-descending order
   *  (months come back from listMine sorted desc, so we just walk
   *  in order). Section headers help with browsing a long list. */
  $: groupedTracks = (() => {
    const groups: { label: string; rows: TrackRow[] }[] = [];
    for (const t of filteredTracks) {
      if (!t.started_at) continue;
      const d = new Date(t.started_at);
      const label = d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long'
      });
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.rows.push(t);
      else groups.push({ label, rows: [t] });
    }
    return groups;
  })();

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    // Within the section the year is in the header, so day + month
    // is enough on the row itself.
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }
  function fmtDistance(m: number | null): string {
    if (m == null) return '—';
    const mi = m / 1609.344;
    return mi >= 0.1 ? `${mi.toFixed(2)} mi` : `${m.toFixed(0)} m`;
  }
  function fmtDuration(start: string, end: string | null): string {
    if (!end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return '—';
    const minutes = Math.round(ms / 60000);
    if (minutes < 90) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }

  function onHeatmapToggle(e: Event) {
    setShowHeatmap((e.currentTarget as HTMLInputElement).checked);
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }
</script>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>My tracks</h1>
</header>

<main>
  <p class="lead">
    Upload GPS tracks from a foraging outing — most watches and tracking
    apps export GPX or KML files. To record live, tap
    <strong>● Record</strong> in the bottom-left of the map. Tracks
    default to <strong>private</strong>; you can share them later.
  </p>

  <div class="upload">
    <input
      type="file"
      accept=".gpx,.kml"
      multiple
      bind:this={fileInput}
      on:change={onFile}
      disabled={uploading}
    />
    {#if uploading}<span class="hint">Importing…</span>{/if}
    {#if uploadError}<p class="error">{uploadError}</p>{/if}
  </div>

  <label class="heatmap-toggle">
    <input
      type="checkbox"
      checked={$settings.showHeatmap}
      on:change={onHeatmapToggle}
    />
    Show foraging heatmap on map
    <span class="muted">— a density layer built from your saved tracks</span>
  </label>

  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if tracks.length === 0}
    <p class="hint">No tracks yet. Drop a GPX or KML file above to import one, or tap Record on the map.</p>
  {:else}
    <div class="filter-chips" role="radiogroup" aria-label="Date range">
      {#each FILTER_OPTIONS as opt}
        <button
          type="button"
          class="chip"
          class:active={dateFilter === opt.k}
          on:click={() => (dateFilter = opt.k)}
          role="radio"
          aria-checked={dateFilter === opt.k}
        >{opt.label}</button>
      {/each}
    </div>
    {#if filteredTracks.length === 0}
      <p class="hint">No tracks in this window.</p>
    {:else}
      {#each groupedTracks as g, i}
        <details class="group" open={i === 0}>
          <summary class="group-label">
            <span class="group-name">{g.label}</span>
            <span class="group-count">{g.rows.length}</span>
          </summary>
          <ul class="track-list" aria-label={'Tracks from ' + g.label}>
            {#each g.rows as t}
              <li class="track-row" class:on={$displayedTrackIds.has(t.id)}>
                <label class="show-toggle" title="Show / hide this track on the map">
                  <input
                    type="checkbox"
                    checked={$displayedTrackIds.has(t.id)}
                    on:change={(e) => onShowToggle(e, t.id)}
                  />
                  <span class="sr-only">Show on map</span>
                </label>
                <button
                  class="star"
                  class:on={t.is_favorite}
                  on:click={() => toggleFavorite(t)}
                  aria-label={t.is_favorite ? 'Unstar' : 'Star'}
                  title={t.is_favorite ? 'Starred' : 'Star this track'}
                >{t.is_favorite ? '★' : '☆'}</button>
                <div class="track-main">
                  <div class="track-title">
                    {#if editingId === t.id}
                      <input
                        class="title-input"
                        bind:value={draftTitle}
                        on:keydown={(e) => onTitleKey(e, t)}
                        on:blur={() => commitRename(t)}
                        use:focusOnMount
                      />
                    {:else}
                      <button
                        type="button"
                        class="title-text"
                        on:dblclick={() => startRename(t)}
                        title="Double-click to rename"
                      >{t.title ?? '(untitled)'}</button>
                    {/if}
                    <span class="src src-{t.source}">{t.source}</span>
                    {#if t.visibility !== 'private'}
                      <span class="vis">{t.visibility}</span>
                    {/if}
                    <button
                      class="row-act"
                      on:click={() => startRename(t)}
                      aria-label="Rename track"
                      title="Rename">✎</button>
                    <button
                      class="row-act danger"
                      on:click={() => onDelete(t)}
                      aria-label="Delete track"
                      title="Delete">×</button>
                  </div>
                  <div class="track-meta">
                    {fmtDate(t.started_at)} · {fmtDistance(t.distance_m)} · {fmtDuration(t.started_at, t.ended_at)}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </details>
      {/each}
    {/if}
  {/if}
</main>

<style>
  header {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.5rem 1rem; background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px; box-sizing: border-box;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 56rem; margin: 0 auto; color: #1f2a1f; }
  .lead { color: #4a554a; line-height: 1.5; margin: 0 0 1rem; }
  .hint { color: #6b7a6b; }
  .muted { color: #6b7a6b; font-weight: 400; }
  .error { color: #b03030; }

  .upload {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    padding: 0.75rem 0.85rem;
    margin-bottom: 0.85rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    flex-wrap: wrap;
  }
  .upload input[type='file'] { font-size: 0.9rem; }

  .heatmap-toggle {
    display: flex; align-items: center; gap: 0.4rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
    color: #3a5a3a;
    cursor: pointer;
  }
  .heatmap-toggle input { margin: 0; }

  .filter-chips {
    display: inline-flex; gap: 0.3rem; flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .chip {
    padding: 0.2rem 0.65rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    border-radius: 1rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip:hover { background: #f0f5ef; }
  .chip.active { background: #3a5a3a; color: white; border-color: #3a5a3a; }

  /* Month-year groups are collapsible <details> blocks. Newest
     opens by default; older months collapse so a long history
     doesn't push everything off the screen. */
  .group { margin: 0.4rem 0; }
  .group-label {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.5rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #3a5a3a;
    background: #f5f8f5;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    user-select: none;
  }
  /* Hide the default disclosure triangle and add our own caret so
     the open/closed state is consistent across browsers. */
  .group-label::-webkit-details-marker { display: none; }
  .group-label::before {
    content: '▸';
    color: #6b7a6b;
    font-size: 0.75rem;
    width: 0.85rem;
    text-align: center;
    transition: transform 0.15s;
  }
  .group[open] > .group-label::before { transform: rotate(90deg); }
  .group-name { flex: 1; }
  .group-count {
    color: #6b7a6b;
    font-weight: 500;
    font-size: 0.78rem;
  }
  .group .track-list { margin-top: 0.4rem; }

  .track-list { list-style: none; margin: 0; padding: 0;
    background: white; border: 1px solid #e1e8e1; border-radius: 0.4rem; overflow: hidden; }
  .track-row {
    display: flex; align-items: center; gap: 0.55rem;
    padding: 0.45rem 0.7rem;
    border-top: 1px solid #f0f5ef;
  }
  .track-row:first-child { border-top: 0; }
  .track-row.on { background: #f7faf6; }
  .show-toggle { display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0; }
  .show-toggle input { width: 1rem; height: 1rem; margin: 0; }
  /* Star button — sits between the show-checkbox and the title.
     Slightly larger than the .row-act buttons because it's a
     primary affordance, not a maintenance one. */
  .star {
    background: transparent;
    border: 0;
    color: #c7d0c7;
    width: 1.6rem; height: 1.6rem;
    border-radius: 0.25rem;
    cursor: pointer;
    line-height: 1;
    font-size: 1.1rem;
    padding: 0;
    flex-shrink: 0;
  }
  .star:hover { color: #d57100; }
  .star.on { color: #d57100; }
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0 0 0 0);
  }
  .track-main { flex: 1; min-width: 0; line-height: 1.25; }
  /* Title row holds title + chips + action buttons. The actions
     cluster after the chips (next to LIVE / GPX) instead of being
     pinned to the row's far right edge — that was unreachable on
     wide browsers without a long mouse trip. */
  .track-title {
    display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
    color: #1f2a1f; font-size: 0.92rem; font-weight: 500;
  }
  /* Title text rendered as a transparent button so the dblclick
     handler attaches to a focusable element (a11y-clean) — visually
     identical to plain text. */
  .title-text {
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: text;
  }
  .title-input {
    flex: 0 1 16rem; min-width: 6rem;
    padding: 0.15rem 0.35rem;
    font-size: 0.92rem;
    font-weight: 500;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    color: #1f2a1f;
    font-family: inherit;
  }
  .track-meta { color: #6b7a6b; font-size: 0.78rem; margin-top: 0.1rem; }
  .src { padding: 0.02rem 0.38rem; border-radius: 0.3rem; font-size: 0.7rem;
    background: #eef3ed; border: 1px solid #d4ddd2; color: #4a554a;
    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
  .src-live { background: #fff4e3; border-color: #e8d3a6; color: #7a4a10; }
  .vis { font-size: 0.72rem; color: #6b7a6b; text-transform: uppercase; letter-spacing: 0.04em; }
  /* Per-row action buttons (rename / delete). Compact, transparent
     by default, light hover. Live next to the source chip so they're
     a tiny mouse hop from the title rather than across the row. */
  .row-act {
    background: transparent;
    border: 0;
    color: #6b7a6b;
    width: 1.5rem; height: 1.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    line-height: 1;
    font-size: 0.95rem;
    padding: 0;
  }
  .row-act:hover { background: #ebefeb; color: #1f2a1f; }
  .row-act.danger { color: #b03030; }
  .row-act.danger:hover { background: #fdf2f2; color: #b03030; }
</style>
