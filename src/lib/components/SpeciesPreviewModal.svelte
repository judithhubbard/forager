<script lang="ts">
  // Lightweight species-info preview, used in contexts where the user
  // is making a choice about a species (interests picker, pin-form
  // species autocomplete, future watchlist editor) and wants to glance
  // at the key facts without losing their place in the parent list.
  //
  // Two layouts via CSS:
  //   - Mobile (<768px): full-screen modal with a "Back" button.
  //   - Desktop (>=768px): right-side drawer that slides in over the
  //     map / list, with a backdrop the user can click to dismiss.
  //
  // Loads species data on demand (cached via speciesService.listAll).
  // No edit affordances — that's the /species/[id] route's job. A
  // small "Open full page" link sends the user there if they want
  // more.

  import { createEventDispatcher, onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';

  export let speciesId: string | null = null;
  export let open: boolean = false;

  const dispatch = createEventDispatcher<{ close: void }>();

  let species: Species | null = null;
  let loading = false;
  let error = '';

  // Cache by id so reopening the modal for the same species is instant.
  const cache = new Map<string, Species>();

  $: if (open && speciesId) void load(speciesId);
  $: if (!open) { species = null; error = ''; }

  async function load(id: string): Promise<void> {
    if (cache.has(id)) {
      species = cache.get(id) ?? null;
      return;
    }
    loading = true;
    error = '';
    try {
      const all = await listSpecies();
      const found = all.find((s) => s.id === id) ?? null;
      if (!found) {
        error = 'Species not found.';
      } else {
        cache.set(id, found);
        species = found;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  }

  function onClose(): void { dispatch('close'); }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && open) onClose();
  }

  // Lock body scroll while the modal is open so the underlying list
  // doesn't scroll behind the modal on mobile. Restore on close.
  let prevBodyOverflow = '';
  $: if (typeof document !== 'undefined') {
    if (open) {
      prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = prevBodyOverflow;
    }
  }
  onDestroy(() => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = prevBodyOverflow;
    }
  });
</script>

<svelte:window on:keydown={onKey} />

{#if open}
  <div class="backdrop" on:click={onClose} role="presentation"></div>
  <aside class="panel" role="dialog" aria-modal="true" aria-label="Species details">
    <header class="panel-header">
      <button class="close-btn" on:click={onClose} aria-label="Close">←</button>
      {#if species}
        <div class="title">
          <div class="common">{species.common_name}</div>
          <div class="sci">{species.scientific_name}</div>
        </div>
      {:else}
        <div class="title"><div class="common">Loading…</div></div>
      {/if}
    </header>

    <div class="body">
      {#if loading}
        <p class="muted">Loading…</p>
      {:else if error}
        <p class="error">{error}</p>
      {:else if species}
        {#if species.image_url}
          <img class="hero" src={species.image_url} alt="" loading="lazy" />
        {/if}

        {#if species.forage_parts && species.forage_parts.length > 0}
          <section class="parts">
            <span class="section-label">Edible parts</span>
            <div class="chips">
              {#each species.forage_parts as p}<span class="chip">{p}</span>{/each}
            </div>
          </section>
        {/if}

        {#if species.safety_notes}
          <section class="block safety">
            <h3>Safety</h3>
            <p class="prose">{species.safety_notes}</p>
          </section>
        {/if}

        {#if species.usage_notes}
          <section class="block">
            <h3>Uses</h3>
            <p class="prose">{species.usage_notes}</p>
          </section>
        {/if}

        {#if species.harvest_tips}
          <section class="block">
            <h3>How to harvest</h3>
            <p class="prose">{species.harvest_tips}</p>
          </section>
        {/if}

        {#if species.toxicity_notes}
          <section class="block toxic">
            <h3>Toxicity / cautions</h3>
            <p class="prose">{species.toxicity_notes}</p>
          </section>
        {/if}

        {#if species.preparation_methods && species.preparation_methods.length > 0}
          <section class="parts">
            <span class="section-label">Preparation</span>
            <div class="chips">
              {#each species.preparation_methods as m}<span class="chip prep">{m}</span>{/each}
            </div>
          </section>
        {/if}

        <a class="full-link" href={`${base}/species/${species.id}`} on:click={onClose}>
          Open full species page →
        </a>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 28, 20, 0.4);
    z-index: 1000;
    animation: fadein 120ms ease-out;
  }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 480px;
    background: white;
    z-index: 1001;
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 24px rgba(0,0,0,0.18);
    animation: slidein 180ms cubic-bezier(0.2,0.7,0.2,1);
  }
  @media (max-width: 767px) {
    .panel {
      max-width: 100%;
      animation: slidein-mobile 180ms cubic-bezier(0.2,0.7,0.2,1);
    }
  }
  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1rem;
    border-bottom: 1px solid #e1e8e1;
    background: #f7faf6;
  }
  .close-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #3a5a3a;
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 0.3rem;
  }
  .close-btn:hover { background: #e8efe5; }
  .title { min-width: 0; flex: 1; }
  .common {
    font-weight: 600;
    color: #2c3f2c;
    font-size: 1.05rem;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sci {
    font-style: italic;
    font-size: 0.85rem;
    color: #6b7a6b;
    margin-top: 0.1rem;
  }
  .body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.1rem 2rem;
  }
  .hero {
    width: 100%;
    max-height: 240px;
    object-fit: cover;
    border-radius: 0.4rem;
    background: #f0f5ef;
    margin-bottom: 0.9rem;
  }
  .section-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #6b7a6b;
    margin-bottom: 0.3rem;
    display: block;
  }
  .parts {
    margin-bottom: 0.9rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .chip {
    font-size: 0.78rem;
    padding: 0.15rem 0.55rem;
    background: #e8efe5;
    border-radius: 0.9rem;
    color: #3a5a3a;
  }
  .chip.prep { background: #f0e8db; color: #6b5a3a; }
  .block {
    margin: 1rem 0 0.6rem;
  }
  .block h3 {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
    color: #3a5a3a;
  }
  .block.safety h3 { color: #a66333; }
  .block.toxic h3 { color: #b13030; }
  .prose {
    font-size: 0.88rem;
    line-height: 1.5;
    color: #2c3a2c;
    margin: 0;
    white-space: pre-wrap;
  }
  .full-link {
    display: inline-block;
    margin-top: 1rem;
    font-size: 0.85rem;
    color: #3a5a3a;
    text-decoration: underline;
  }
  .muted { color: #6b7a6b; }
  .error { color: #b13030; }
  @keyframes fadein {
    from { opacity: 0; } to { opacity: 1; }
  }
  @keyframes slidein {
    from { transform: translateX(100%); } to { transform: translateX(0); }
  }
  @keyframes slidein-mobile {
    from { transform: translateX(100%); } to { transform: translateX(0); }
  }
</style>
