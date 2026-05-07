<script lang="ts">
  // Persistent recorder badge — shown on every page (via the
  // layout) so the user can see at a glance that a recording is
  // active and can stop+save from anywhere without navigating
  // back to the map. Hidden when idle so it doesn't add chrome
  // to non-recording use.

  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { readable } from 'svelte/store';
  import { recording, stop as stopRec } from '$lib/stores/recording';
  import { importParsedTrack } from '$lib/services/trackService';
  import { showTrack } from '$lib/stores/displayedTracks';
  import { activeRegion } from '$lib/stores/activeRegion';

  const now = readable(Date.now(), (set) => {
    const id = setInterval(() => set(Date.now()), 250);
    return () => clearInterval(id);
  });

  let saving = false;
  let error = '';

  $: rec = $recording;
  $: isActive = rec.status === 'recording' || rec.status === 'paused';
  // Hide on the map page since the map has its own recorder
  // overlay and the badge would duplicate it.
  $: isOnMap = (() => {
    const p = $page.url.pathname;
    if (base && p.startsWith(base)) {
      const rest = p.slice(base.length);
      return rest === '/' || rest === '';
    }
    return p === '/';
  })();

  let elapsedLabel = '0:00';
  $: {
    const ms = rec.startedAt ? (rec.endedAt ?? $now) - rec.startedAt : 0;
    elapsedLabel = fmtElapsed(ms);
  }

  function fmtElapsed(ms: number): string {
    if (ms <= 0) return '0:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function autoTitle(startedAt: number | null): string {
    const d = startedAt ? new Date(startedAt) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `Track ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function handleStop() {
    error = '';
    if (rec.points.length < 2) {
      // Nothing usable — just clear and bail.
      stopRec();
      return;
    }
    saving = true;
    try {
      const snap = stopRec();
      const parsed = {
        title: autoTitle(snap.startedAt),
        source: 'live' as const,
        points: snap.points.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recorded_at: new Date(p.ts).toISOString(),
          elevation_m: null
        }))
      };
      const newId = await importParsedTrack(parsed, {
        regionId: $activeRegion?.id ?? null,
        title: parsed.title,
        visibility: 'private'
      });
      showTrack(newId);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not save the recording.';
    } finally {
      saving = false;
    }
  }
</script>

{#if isActive && !isOnMap}
  <div class="badge-wrap">
    <button class="rec-badge" on:click={handleStop} disabled={saving}>
      {#if rec.status === 'recording'}
        <span class="dot" aria-hidden="true"></span>
      {:else}
        <span class="paused" aria-hidden="true">⏸</span>
      {/if}
      <span class="elapsed">{elapsedLabel}</span>
      <span class="stop" aria-hidden="true">⏹</span>
    </button>
    <button
      class="open-map"
      on:click={() => goto('/')}
      title="Open the map"
      aria-label="Open the map"
    >🗺</button>
    {#if error}<div class="err" role="status">{error}</div>{/if}
  </div>
{/if}

<style>
  .badge-wrap {
    position: fixed;
    top: 0.55rem;
    right: 0.75rem;
    z-index: 1500;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .rec-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.65rem;
    border-radius: 0.35rem;
    border: 1px solid #c14a3a;
    background: #fff3f0;
    color: #1f2a1f;
    font-size: 0.82rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
    line-height: 1;
  }
  .rec-badge:hover { background: #ffe9e3; }
  .rec-badge:disabled { opacity: 0.65; cursor: default; }
  .dot {
    width: 0.55rem; height: 0.55rem; border-radius: 50%;
    background: #c14a3a;
    flex-shrink: 0;
    animation: rec-pulse 1.4s infinite;
    box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6);
  }
  @keyframes rec-pulse {
    0% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0.6); }
    70% { box-shadow: 0 0 0 5px rgba(193, 74, 58, 0); }
    100% { box-shadow: 0 0 0 0 rgba(193, 74, 58, 0); }
  }
  .paused { color: #7a4a10; }
  .stop { color: #b03030; }
  .open-map {
    background: white;
    border: 1px solid #c7d0c7;
    color: #3a5a3a;
    width: 1.85rem;
    height: 1.85rem;
    border-radius: 0.3rem;
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
  .open-map:hover { background: #f0f5ef; }
  .err {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.3rem;
    background: #fff5f5;
    border: 1px solid #d6a3a3;
    color: #a02323;
    padding: 0.35rem 0.55rem;
    border-radius: 0.3rem;
    font-size: 0.78rem;
    max-width: 16rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }
</style>
