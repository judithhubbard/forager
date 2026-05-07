<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import {
    listAll as listSpecies,
    updateCuration,
    type Species,
    type SpeciesCurationPatch
  } from '$lib/services/speciesService';
  import { session } from '$lib/stores/auth';
  import { profile } from '$lib/stores/profile';
  import {
    isWatchingSpecies,
    watchSpecies,
    unwatch,
    type WatchlistRow
  } from '$lib/services/watchlistService';

  let species: Species | null = null;
  let loading = true;
  let error = '';
  let watching: WatchlistRow | null = null;
  let watchBusy = false;

  $: speciesParam = $page.params.id ?? '';

  /** Slugify a scientific name for URL matching: lowercase,
   *  whitespace + punctuation → hyphens, collapse runs. So
   *  "Cornus mas" → "cornus-mas", "Rubus × neglectus" →
   *  "rubus-neglectus". Pure helper, deterministic. */
  function slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  onMount(async () => {
    try {
      const all = await listSpecies();
      // Accept either the UUID or a slug of the scientific name.
      // External links (search results, shared URLs) read better
      // with slugs; internal links can keep using the UUID.
      species =
        all.find((s) => s.id === speciesParam) ??
        all.find((s) => slugify(s.scientific_name) === speciesParam.toLowerCase()) ??
        null;
      if (!species) error = 'Species not found.';
      else if ($session) {
        watching = await isWatchingSpecies(species.id);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load species.';
    } finally {
      loading = false;
    }
  });

  async function toggleWatch() {
    if (!species) return;
    watchBusy = true;
    try {
      if (watching) {
        await unwatch(watching.id);
        watching = null;
      } else {
        const id = await watchSpecies(species.id);
        watching = {
          id,
          user_id: $session?.user?.id ?? '',
          species_id: species.id,
          pin_id: null,
          notify_email: true,
          notify_in_app: true,
          created_at: new Date().toISOString()
        };
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not update watch.';
    } finally {
      watchBusy = false;
    }
  }

  function back() {
    if (history.length > 1) history.back();
    else goto('/');
  }

  $: ogTitle = species?.common_name
    ? `${species.common_name} · Forager`
    : 'Forager';
  $: ogDescription = species
    ? `${species.common_name} (${species.scientific_name}) — edible parts, preparation methods, harvest tips, and safety notes for foragers.`
    : 'A foragable species on Forager.';

  /** Pretty-print a snake_case forage_part or preparation_method. */
  function pretty(s: string): string {
    return s.replace(/_/g, ' ');
  }

  /** Parse an attribution string into rendered segments. The
   *  Wikidata pull script writes 'Wikidata: Qxxx · Wikipedia: <url>',
   *  but the field is also free-form for hand-curated values, so
   *  fall through unchanged when no recognized prefix is present. */
  type AttribPart =
    | { kind: 'text'; value: string }
    | { kind: 'link'; label: string; href: string };
  function parseAttribution(s: string): AttribPart[] {
    const parts: AttribPart[] = [];
    for (const seg of s.split('·').map((x) => x.trim()).filter(Boolean)) {
      const wd = seg.match(/^Wikidata:\s*(Q\d+)$/i);
      const wp = seg.match(/^Wikipedia:\s*(https?:\/\/\S+)$/i);
      if (wd) {
        parts.push({
          kind: 'link',
          label: `Wikidata ${wd[1]}`,
          href: `https://www.wikidata.org/wiki/${wd[1]}`
        });
      } else if (wp) {
        parts.push({ kind: 'link', label: 'Wikipedia', href: wp[1] });
      } else {
        parts.push({ kind: 'text', value: seg });
      }
    }
    return parts;
  }
  $: attribParts = species?.attribution ? parseAttribution(species.attribution) : [];

  /** Parse the species.image_attribution string into structured
   *  parts. The wikidata-images script emits 'Author · License ·
   *  https://commons.wikimedia.org/...'. Hand-curated rows might
   *  use a different shape, so we recognize URLs anywhere and
   *  treat the rest as text. */
  type ImgAttribPart =
    | { kind: 'text'; value: string }
    | { kind: 'link'; label: string; href: string };
  function parseImgAttribution(s: string): ImgAttribPart[] {
    const parts: ImgAttribPart[] = [];
    for (const seg of s.split('·').map((x) => x.trim()).filter(Boolean)) {
      const url = seg.match(/^(https?:\/\/\S+)$/);
      if (url) {
        parts.push({ kind: 'link', label: 'source', href: url[1] });
      } else {
        parts.push({ kind: 'text', value: seg });
      }
    }
    return parts;
  }
  $: imgAttribParts = species?.image_attribution
    ? parseImgAttribution(species.image_attribution)
    : [];

  /** Inline curation UI — visible only to global admins. The Edit
   *  button populates these draft fields from the loaded species,
   *  Save calls updateCuration and folds the response back into
   *  `species` so the read view picks up the new values without
   *  a reload. RLS gate is server-side; the UI just hides the
   *  affordance for non-admins to keep the page clean. */
  $: isAdmin = $profile?.is_global_admin === true;
  let editing = false;
  let saving = false;
  let saveError = '';
  let draftForageParts = '';
  let draftPrepMethods = '';
  let draftUsageNotes = '';
  let draftHarvestTips = '';
  let draftToxicityNotes = '';
  let draftSafetyNotes = '';
  let draftImageUrl = '';
  let draftImageAttribution = '';

  function startEdit(): void {
    if (!species) return;
    draftForageParts = (species.forage_parts ?? []).join(', ');
    draftPrepMethods = (species.preparation_methods ?? []).join(', ');
    draftUsageNotes = species.usage_notes ?? '';
    draftHarvestTips = species.harvest_tips ?? '';
    draftToxicityNotes = species.toxicity_notes ?? '';
    draftSafetyNotes = species.safety_notes ?? '';
    draftImageUrl = species.image_url ?? '';
    draftImageAttribution = species.image_attribution ?? '';
    saveError = '';
    editing = true;
  }
  function cancelEdit(): void {
    editing = false;
    saveError = '';
  }
  /** Hide the image preview if the URL fails to load. svelte-check
   *  trips on inline TS casts in event handlers, hence the helper. */
  function hidePreviewOnError(e: Event): void {
    const img = e.currentTarget as HTMLImageElement;
    img.style.display = 'none';
  }
  /** Comma-list → trimmed, deduped lowercase array. The empty
   *  string maps to []. Used for both forage_parts and
   *  preparation_methods which are stored as text[]. */
  function parseList(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of raw.split(',')) {
      const v = s.trim().toLowerCase();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }
  async function saveEdit(): Promise<void> {
    if (!species) return;
    saving = true;
    saveError = '';
    try {
      const patch: SpeciesCurationPatch = {
        forage_parts: parseList(draftForageParts),
        preparation_methods: parseList(draftPrepMethods),
        usage_notes: draftUsageNotes.trim() || null,
        harvest_tips: draftHarvestTips.trim() || null,
        toxicity_notes: draftToxicityNotes.trim() || null,
        safety_notes: draftSafetyNotes.trim(),
        image_url: draftImageUrl.trim() || null,
        image_attribution: draftImageAttribution.trim() || null
      };
      const updated = await updateCuration(species.id, patch);
      species = updated;
      editing = false;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'Save failed.';
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>{ogTitle}</title>
  <meta name="description" content={ogDescription} />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary" />
</svelte:head>

<header>
  <button class="back" on:click={back} aria-label="Back">← Back</button>
  <h1>{species?.common_name ?? 'Species'}</h1>
</header>

<main>
  {#if loading}
    <p class="hint">Loading…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if species}
    <p class="sci">{species.scientific_name}</p>
    {#if species.aliases?.length}
      <p class="aliases">Also known as: {species.aliases.join(', ')}</p>
    {/if}

    {#if species.image_url}
      <figure class="hero">
        <img
          src={species.image_url}
          alt={species.common_name + ' — ' + species.scientific_name}
          loading="lazy"
        />
        {#if imgAttribParts.length}
          <figcaption>
            {#each imgAttribParts as p, i}
              {#if i > 0}<span class="sep"> · </span>{/if}
              {#if p.kind === 'link'}
                <a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a>
              {:else}
                <span>{p.value}</span>
              {/if}
            {/each}
          </figcaption>
        {/if}
      </figure>
    {/if}

    {#if $session}
      <div class="actions">
        <button
          class="watch"
          class:active={!!watching}
          on:click={toggleWatch}
          disabled={watchBusy}
        >
          {watching ? '★ Watching — tap to stop' : '☆ Watch · notify when ripe'}
        </button>
        {#if isAdmin && !editing}
          <button class="edit-btn" on:click={startEdit}>✎ Edit (admin)</button>
        {/if}
      </div>
    {/if}

    {#if editing}
      <form class="edit-form" on:submit|preventDefault={saveEdit}>
        <p class="edit-help">
          Curating from a source like Wikipedia? Read it, then write your own short
          statements here. Don't paste source text — facts aren't copyrighted; expression is.
        </p>
        <label>
          Edible parts
          <input
            type="text"
            bind:value={draftForageParts}
            placeholder="comma-separated: fruit, leaf, flower, …"
          />
          <span class="hint-inline">enum-ish: fruit · nut · flower · leaf · mushroom · root · bark · seed · sap</span>
        </label>
        <label>
          Preparation methods
          <input
            type="text"
            bind:value={draftPrepMethods}
            placeholder="raw, jam, dried, pickle, syrup, …"
          />
        </label>
        <label>
          Uses
          <textarea rows="3" bind:value={draftUsageNotes}
            placeholder="When/how to harvest. What to make."></textarea>
        </label>
        <label>
          Harvest tips
          <textarea rows="3" bind:value={draftHarvestTips}
            placeholder="Tools, technique, what to look for."></textarea>
        </label>
        <label>
          Toxicity notes
          <textarea rows="2" bind:value={draftToxicityNotes}
            placeholder="Parts to avoid. Prep cautions."></textarea>
        </label>
        <label>
          Safety (one-line summary shown in pin panel)
          <input type="text" bind:value={draftSafetyNotes}
            placeholder="e.g. 'Pits are toxic — only eat the flesh.'" />
        </label>
        <label>
          Image URL
          <input type="url" bind:value={draftImageUrl}
            placeholder="https://commons.wikimedia.org/wiki/Special:FilePath/...?width=600" />
          <span class="hint-inline">A direct image URL. Wikimedia Commons file paths (auto-filled by the import script) work well.</span>
        </label>
        {#if draftImageUrl}
          <div class="img-preview">
            <img src={draftImageUrl} alt="preview" on:error={hidePreviewOnError} />
          </div>
        {/if}
        <label>
          Image attribution (required if image is set — license + author + source link)
          <textarea rows="2" bind:value={draftImageAttribution}
            placeholder="Author Name · CC BY-SA 4.0 · https://commons.wikimedia.org/wiki/File:..."></textarea>
        </label>
        {#if saveError}<p class="error">{saveError}</p>{/if}
        <div class="edit-actions">
          <button type="submit" class="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" on:click={cancelEdit} disabled={saving}>Cancel</button>
        </div>
      </form>
    {/if}

    {#if !editing}
      {#if species.forage_parts?.length}
        <section>
          <h2>Edible parts</h2>
          <div class="chips">
            {#each species.forage_parts as part}
              <span class="chip">{pretty(part)}</span>
            {/each}
          </div>
        </section>
      {/if}

      {#if species.preparation_methods?.length}
        <section>
          <h2>Preparation</h2>
          <div class="chips">
            {#each species.preparation_methods as method}
              <span class="chip method">{pretty(method)}</span>
            {/each}
          </div>
        </section>
      {/if}

      {#if species.usage_notes}
        <section>
          <h2>Uses</h2>
          <p class="prose">{species.usage_notes}</p>
        </section>
      {/if}

      {#if species.harvest_tips}
        <section>
          <h2>Harvest tips</h2>
          <p class="prose">{species.harvest_tips}</p>
        </section>
      {/if}

      {#if species.toxicity_notes}
        <section class="warn">
          <h2>Toxicity</h2>
          <p class="prose">{species.toxicity_notes}</p>
        </section>
      {/if}

      {#if species.safety_notes}
        <section class="warn">
          <h2>Safety</h2>
          <p class="prose">{species.safety_notes}</p>
        </section>
      {/if}
    {/if}

    <section class="disclaimer">
      <p>
        Misidentification can be dangerous. Always confirm identity from
        multiple sources before harvesting. When in doubt, don't eat it.
      </p>
    </section>

    {#if attribParts.length}
      <p class="attrib">
        Source:
        {#each attribParts as p, i}
          {#if i > 0}<span class="sep"> · </span>{/if}
          {#if p.kind === 'link'}
            <a href={p.href} target="_blank" rel="noopener noreferrer">{p.label}</a>
          {:else}
            <span>{p.value}</span>
          {/if}
        {/each}
      </p>
    {/if}

    <p class="see-also">
      <a href={base + '/?species=' + species.id}>Show pins of this species on the map →</a>
    </p>
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
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }
  main { padding: 1.25rem 1rem 3rem; max-width: 38rem; margin: 0 auto; line-height: 1.55; color: #1f2a1f; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; }
  .sci { font-style: italic; color: #4a554a; margin: 0.1rem 0 0.4rem; }
  .aliases { color: #6b7a6b; font-size: 0.9rem; margin-top: 0; }

  /* Hero image — rendered between the title block and the action
     row. Wikimedia Commons mostly delivers vertical or square
     thumbnails; cap height to keep the page readable on phones. */
  .hero {
    margin: 0.85rem 0 0.6rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
  .hero img {
    width: 100%;
    max-height: 22rem;
    object-fit: cover;
    border-radius: 0.4rem;
    background: #f0f5ef;
    display: block;
  }
  .hero figcaption {
    margin-top: 0.35rem;
    font-size: 0.72rem;
    color: #6b7a6b;
    line-height: 1.4;
  }
  .hero figcaption a { color: #3a5a3a; }
  .hero figcaption .sep { color: #8a948a; }
  section { margin-top: 1.25rem; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 0 0 0.45rem; }
  .prose { margin: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .chip {
    background: #eef3ed;
    color: #1f2a1f;
    padding: 0.2rem 0.55rem;
    border-radius: 0.6rem;
    font-size: 0.85rem;
    border: 1px solid #d4ddd2;
  }
  .chip.method { background: #fff4e3; border-color: #e8d3a6; }
  .warn h2 { color: #b03030; }
  .disclaimer {
    margin-top: 1.5rem;
    padding: 0.75rem 0.85rem;
    border-left: 3px solid #6b7a6b;
    background: #f7faf6;
    font-size: 0.9rem;
    color: #2a322a;
  }
  .disclaimer p { margin: 0; }
  .attrib { color: #6b7a6b; font-size: 0.8rem; margin-top: 1.25rem; }
  .see-also { margin-top: 1.5rem; }
  .see-also a { color: #3a5a3a; }
  .watch {
    display: inline-block;
    margin-top: 0.75rem;
    padding: 0.4rem 0.85rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    border-radius: 0.35rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .watch:hover { background: #f0f5ef; }
  .watch.active {
    background: #fff4e3;
    border-color: #e8d3a6;
    color: #7a4a10;
  }

  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
  .edit-btn {
    padding: 0.4rem 0.85rem;
    border: 1px solid #c7d0c7;
    background: #f5f8f5;
    color: #3a5a3a;
    border-radius: 0.35rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .edit-btn:hover { background: #ebefeb; }

  /* Admin curation form. Reuses the Forager green-on-white palette
     so it doesn't visually shout 'admin tool'. */
  .edit-form {
    margin-top: 1rem;
    padding: 0.85rem 0.95rem;
    background: #fafcf6;
    border: 1px solid #c7d0c7;
    border-radius: 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .edit-help {
    margin: 0;
    font-size: 0.82rem;
    color: #4a554a;
    background: #fff7e6;
    border: 1px solid #e8d3a6;
    padding: 0.4rem 0.55rem;
    border-radius: 0.3rem;
    line-height: 1.4;
  }
  .edit-form label {
    display: flex; flex-direction: column; gap: 0.2rem;
    font-size: 0.85rem; color: #3a5a3a; font-weight: 600;
  }
  .edit-form input[type='text'],
  .edit-form textarea {
    padding: 0.45rem 0.6rem;
    font-size: 0.9rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
    font-family: inherit;
    color: #1f2a1f;
    font-weight: 400;
  }
  .edit-form textarea { resize: vertical; line-height: 1.45; }
  .hint-inline { color: #6b7a6b; font-weight: 400; font-size: 0.78rem; }
  .img-preview {
    margin: -0.2rem 0 0.2rem;
    background: #ebefeb;
    border-radius: 0.3rem;
    overflow: hidden;
    max-width: 16rem;
  }
  .img-preview img { width: 100%; height: auto; display: block; max-height: 10rem; object-fit: cover; }
  .edit-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; }
  .edit-actions button {
    padding: 0.45rem 0.95rem;
    font-size: 0.9rem;
    border-radius: 0.35rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    cursor: pointer;
  }
  .edit-actions button.primary {
    background: #3a5a3a; color: white; border-color: #3a5a3a;
  }
  .edit-actions button:disabled { opacity: 0.6; cursor: default; }
</style>
