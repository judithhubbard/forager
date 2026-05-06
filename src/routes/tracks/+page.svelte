<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { activeRegion } from '$lib/stores/activeRegion';
  import {
    listMine,
    importTrackFile,
    remove,
    type TrackRow
  } from '$lib/services/trackService';

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

  async function onDelete(t: TrackRow) {
    if (!confirm(`Delete "${t.title ?? 'this track'}"? This cannot be undone.`)) return;
    try {
      await remove(t.id);
      tracks = tracks.filter((x) => x.id !== t.id);
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
