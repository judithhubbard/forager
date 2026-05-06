<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { geocode, zoomForBbox, type GeocodeResult } from '$lib/services/geocoder';

  const dispatch = createEventDispatcher<{
    select: { lng: number; lat: number; zoom: number; label: string };
  }>();

  let query = '';
  let results: GeocodeResult[] = [];
  let open = false;
  let loading = false;
  let error = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: AbortController | null = null;
  let highlightIdx = -1;

  // 300ms keystroke debounce — Nominatim's TOS asks for ~1 req/sec
  // per IP. Debouncing also keeps the dropdown from flickering as
  // the user types.
  function onInput() {
    if (timer) clearTimeout(timer);
    error = '';
    if (!query.trim()) {
      results = [];
      open = false;
      loading = false;
      return;
    }
    timer = setTimeout(runQuery, 300);
  }

  async function runQuery() {
    if (inflight) inflight.abort();
    inflight = new AbortController();
    loading = true;
    try {
      const r = await geocode(query, { limit: 6, signal: inflight.signal });
      results = r;
      open = true;
      highlightIdx = r.length > 0 ? 0 : -1;
    } catch (e) {
      // AbortError is expected when the user keeps typing.
      if ((e as Error).name === 'AbortError') return;
      error = $_('search.failed');
      results = [];
      open = true;
    } finally {
      loading = false;
    }
  }

  function pick(r: GeocodeResult) {
    dispatch('select', {
      lng: r.lng,
      lat: r.lat,
      zoom: zoomForBbox(r.bbox),
      label: r.display_name
    });
    // Keep the chosen label in the input as a confirmation, but
    // collapse the dropdown.
    query = r.display_name.split(',').slice(0, 2).join(',').trim();
    open = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = (highlightIdx - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0) pick(results[highlightIdx]);
    } else if (e.key === 'Escape') {
      open = false;
    }
  }

  function onBlur() {
    // Delay so a click on a result registers before the list is hidden.
    setTimeout(() => { open = false; }, 150);
  }
  function onFocus() {
    if (results.length > 0) open = true;
  }
</script>

<div class="search-wrap">
  <input
    type="search"
    placeholder={$_('search.address_placeholder')}
    bind:value={query}
    on:input={onInput}
    on:keydown={onKeyDown}
    on:blur={onBlur}
    on:focus={onFocus}
    aria-label={$_('search.address_placeholder')}
    autocomplete="off"
  />
  {#if loading}
    <span class="hint" aria-live="polite">…</span>
  {/if}
  {#if open}
    <ul class="dropdown" role="listbox">
      {#if error}
        <li class="msg">{error}</li>
      {:else if results.length === 0 && !loading}
        <li class="msg">{$_('search.no_matches')}</li>
      {:else}
        {#each results as r, i}
          <li
            class="result"
            class:active={i === highlightIdx}
            role="option"
            aria-selected={i === highlightIdx}
            on:mousedown|preventDefault={() => pick(r)}
            on:mouseenter={() => (highlightIdx = i)}
          >
            {r.display_name}
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .search-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  input {
    width: 14rem;
    max-width: 100%;
    padding: 0.3rem 0.5rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    font-size: 0.85rem;
    background: white;
    color: #1f2a1f;
  }
  input:focus { outline: 2px solid #3a5a3a; outline-offset: -1px; }
  .hint {
    margin-left: 0.4rem;
    font-size: 0.8rem;
    color: #4a554a;
  }
  .dropdown {
    position: absolute;
    top: calc(100% + 0.2rem);
    left: 0;
    right: 0;
    z-index: 1200;
    margin: 0;
    padding: 0;
    list-style: none;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.3rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    max-height: 16rem;
    overflow-y: auto;
  }
  .result, .msg {
    padding: 0.45rem 0.6rem;
    font-size: 0.82rem;
    color: #1f2a1f;
    cursor: pointer;
    border-bottom: 1px solid #f0f5ef;
  }
  .result:last-child { border-bottom: 0; }
  .result.active, .result:hover { background: #f0f5ef; }
  .msg { color: #4a554a; cursor: default; font-style: italic; }
  @media (max-width: 640px) {
    input { width: 10rem; font-size: 0.9rem; }
  }
</style>
