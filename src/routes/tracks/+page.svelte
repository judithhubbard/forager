<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listMine,
    importTrackFile,
    importParsedTrack,
    remove,
    type TrackRow
  } from '$lib/services/trackService';
  import {
    recording,
    start as startRec,
    pause as pauseRec,
    resume as resumeRec,
    stop as stopRec,
    discard as discardRec,
    bufferedDistanceMeters
  } from '$lib/stores/recording';
  import {
    displayedTrackIds,
    showTrack,
    hideTrack
  } from '$lib/stores/displayedTracks';
  import { formatElapsed } from '$lib/utils/formatTime';

  let tracks: TrackRow[] = [];
  let loading = true;
  let error = '';
  let uploading = false;
  let uploadError = '';
  let fileInput: HTMLInputElement;

  // Live recorder state — driven by the global store. Title input
  // appears when the user is about to save.
  let saveTitle = '';
  let saveBusy = false;
  let saveError = '';
  // Tick once a second so the elapsed-time display in the recorder
  // panel updates while running. The points list itself updates via
  // the store subscription; this is just for the duration counter.
  let nowMs = Date.now();
  let tickInterval: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    tickInterval = setInterval(() => (nowMs = Date.now()), 1000);
    return () => {
      if (tickInterval) clearInterval(tickInterval);
    };
  });

  $: rec = $recording;
  $: bufferedDist = bufferedDistanceMeters(rec);
  $: elapsedMs =
    rec.startedAt && (rec.status !== 'idle')
      ? (rec.endedAt ?? nowMs) - rec.startedAt
      : 0;


  async function saveRecording() {
    if (rec.points.length < 2) {
      saveError = 'Need at least 2 GPS points to save.';
      return;
    }
    saveBusy = true;
    saveError = '';
    try {
      const snap = stopRec();
      // Convert recorded buffer to the shared parsed-track shape
      // and reuse importParsedTrack so save logic stays in one
      // place (distance, geometry, bulk insert, RLS rollback).
      const parsed = {
        title: saveTitle.trim() || 'Recorded track',
        source: 'live' as const,
        points: snap.points.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recorded_at: new Date(p.ts).toISOString(),
          elevation_m: null
        }))
      };
      await importParsedTrack(parsed, {
        regionId: $activeRegion?.id ?? null,
        title: parsed.title,
        visibility: 'private'
      });
      discardRec();
      saveTitle = '';
      await load();
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      saveBusy = false;
    }
  }

  function onDiscard() {
    if (rec.points.length > 0 && !confirm('Throw away the in-progress recording?')) return;
    discardRec();
    saveTitle = '';
    saveError = '';
  }

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
      // Drop from the displayed set too — otherwise the polyline
      // would linger until next reload.
      hideTrack(t.id);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Delete failed.';
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
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
    apps export GPX or KML files. Tracks default to <strong>private</strong>;
    you can share them later from this page.
  </p>

  <!-- Live recorder. Browser-side GPS via watchPosition; foreground
       only on PWA, so backgrounding the tab pauses sampling. Buffer
       persists in localStorage across reloads. -->
  <section class="recorder" class:active={rec.status !== 'idle'}>
    <header>
      <span class="recorder-title">Record now</span>
      {#if rec.status === 'recording'}
        <span class="rec-dot" aria-hidden="true"></span>
        <span>Recording</span>
      {:else if rec.status === 'paused'}
        <span class="rec-paused">⏸ Paused</span>
      {/if}
    </header>
    {#if rec.status === 'idle'}
      <p class="hint">
        Start a track to log your foraging route. GPS samples every
        few seconds while this tab is foregrounded; pause if you
        want to skip a stretch.
      </p>
      <div class="rec-actions">
        <button class="primary" on:click={startRec}>● Start recording</button>
      </div>
    {:else}
      <p class="rec-stats">
        <strong>{formatElapsed(elapsedMs)}</strong>
        · {rec.points.length} point{rec.points.length === 1 ? '' : 's'}
        · {(bufferedDist / 1609.344).toFixed(2)} mi
      </p>
      {#if rec.error}<p class="error">{rec.error}</p>{/if}
      <div class="rec-actions">
        {#if rec.status === 'recording'}
          <button on:click={pauseRec}>⏸ Pause</button>
        {:else}
          <button class="primary" on:click={resumeRec}>▶ Resume</button>
        {/if}
        <input
          type="text"
          placeholder="Title for this track (optional)"
          bind:value={saveTitle}
          disabled={saveBusy}
        />
        <button class="primary" on:click={saveRecording} disabled={saveBusy || rec.points.length < 2}>
          {saveBusy ? 'Saving…' : '✓ Save'}
        </button>
        <button class="danger" on:click={onDiscard} disabled={saveBusy}>Discard</button>
      </div>
      {#if saveError}<p class="error">{saveError}</p>{/if}
    {/if}
  </section>

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

  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if tracks.length === 0}
    <p class="hint">No tracks yet. Drop a GPX or KML file above to import one.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Show</th>
          <th>Title</th>
          <th>Date</th>
          <th>Distance</th>
          <th>Duration</th>
          <th>Source</th>
          <th>Visibility</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each tracks as t}
          <tr>
            <td>
              <input
                type="checkbox"
                checked={$displayedTrackIds.has(t.id)}
                on:change={(e) => onShowToggle(e, t.id)}
                title="Toggle this track on the map"
              />
            </td>
            <td>{t.title ?? '(untitled)'}</td>
            <td>{fmtDate(t.started_at)}</td>
            <td>{fmtDistance(t.distance_m)}</td>
            <td>{fmtDuration(t.started_at, t.ended_at)}</td>
            <td><span class="src src-{t.source}">{t.source}</span></td>
            <td>{t.visibility}</td>
            <td>
              <button class="rm" on:click={() => onDelete(t)} aria-label="Delete">×</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
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
  .error { color: #b03030; }

  .upload {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    padding: 0.75rem 0.85rem;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.85rem;
    flex-wrap: wrap;
  }
  .upload input[type='file'] { font-size: 0.9rem; }

  .recorder {
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
    padding: 0.85rem 0.95rem;
    margin-bottom: 1rem;
  }
  .recorder.active { border-color: #3a5a3a; background: #fbfdfa; }
  .recorder header {
    display: flex; align-items: center; gap: 0.6rem;
    font-size: 0.95rem; color: #3a5a3a; font-weight: 600;
    margin-bottom: 0.4rem;
  }
  .recorder-title { color: #1f2a1f; }
  .rec-dot {
    width: 0.7rem; height: 0.7rem; border-radius: 50%;
    background: #c14a3a;
    animation: pulse 1.4s infinite;
    box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6);
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6); }
    70% { box-shadow: 0 0 0 8px rgba(193, 74, 58, 0); }
    100% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0); }
  }
  .rec-paused { color: #7a4a10; }
  .rec-stats { margin: 0.25rem 0 0.6rem; color: #1f2a1f; }
  .rec-actions {
    display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
  }
  .rec-actions input[type='text'] {
    flex: 1 1 14rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    font-size: 0.9rem;
  }
  .rec-actions button {
    padding: 0.35rem 0.85rem;
    border-radius: 0.3rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .rec-actions button.primary {
    background: #3a5a3a; color: white; border-color: #3a5a3a;
  }
  .rec-actions button.danger {
    color: #b03030; border-color: #d6a3a3;
  }
  .rec-actions button:disabled { opacity: 0.6; cursor: default; }

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border: 1px solid #e1e8e1;
    border-radius: 0.4rem;
    overflow: hidden;
  }
  th, td { padding: 0.5rem 0.7rem; text-align: left; font-size: 0.88rem; }
  th { background: #f5f8f5; color: #3a5a3a; font-weight: 600; border-bottom: 1px solid #e1e8e1; }
  tr + tr td { border-top: 1px solid #f0f5ef; }
  .src { padding: 0.05rem 0.45rem; border-radius: 0.3rem; font-size: 0.78rem; background: #eef3ed; border: 1px solid #d4ddd2; }
  .src-live { background: #fff4e3; border-color: #e8d3a6; color: #7a4a10; }
  .rm {
    background: transparent;
    border: 1px solid #d6c0c0;
    color: #b03030;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 0.3rem;
    cursor: pointer;
    line-height: 1;
  }
  .rm:hover { background: #fdf2f2; }
</style>
