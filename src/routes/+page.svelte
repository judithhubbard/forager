<script lang="ts">
  import { goto } from '$lib/utils/nav';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import { activeRegion, regionsLoading, myRegions } from '$lib/stores/activeRegion';
  import { session } from '$lib/stores/auth';
  import { online } from '$lib/stores/network';
  import { mapViewport, setMapViewport } from '$lib/stores/mapViewport';
  import {
    listPublicPins,
    listPublicPinDensity,
    listPublicPinSummary,
    listRegionPins,
    listRegionPinDensity,
    listRegionPinSummary,
    getEffective as getEffectivePin,
    updateLocation as updatePinLocation,
    type PinEffective,
    type Bbox,
    type PinCluster,
    type PinDensityBucket,
    type PinBboxSummaryRow
  } from '$lib/services/pinService';
  import { listAll as listSpecies, type Species } from '$lib/services/speciesService';
  import {
    listMyTrackPoints,
    importParsedTrack,
    getTrackPoints,
    listByIds as listTracksByIds
  } from '$lib/services/trackService';
  import { recording, stop as stopRecording } from '$lib/stores/recording';
  import { displayedTrackIds, showTrack } from '$lib/stores/displayedTracks';
  // Renamed from `Map` because the bare name shadows the JS Map
   // built-in type in TypeScript, which broke a `new Map<...>()`
   // declaration elsewhere in this file.
  import MapView from '$lib/components/Map.svelte';
  import DropPinModal from '$lib/components/DropPinModal.svelte';
  import PinDetailContent from '$lib/components/PinDetailContent.svelte';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';
  import AddressSearch from '$lib/components/AddressSearch.svelte';
  import SignupBanner from '$lib/components/SignupBanner.svelte';
  import { settings, setMapLayer, setShowZones, type MapLayerKey } from '$lib/stores/settings';
  import { profile } from '$lib/stores/profile';
  import {
    enabledIds,
    disabledIds
  } from '$lib/stores/userPreferences';
  import {
    panelSelection,
    clearAll as clearPanelSelection,
    selectAll as selectAllPanelSelection,
    toggle as togglePanelSelection
  } from '$lib/stores/panelSelection';
  import { dataChange, pinChanged } from '$lib/stores/dataChange';
  import { colorForGroup, colorForCategoryFallback } from '$lib/utils/symbology';

  let pins: PinEffective[] = [];
  let clusters: PinCluster[] = [];
  let pinsLoading = false;

  /** Heatmap points loaded from the user's uploaded tracks. Lazy:
   *  fetched the first time the user enables the toggle and cached
   *  for the session so subsequent on/off flips are instant. Cleared
   *  on sign-out via the session reactive below. */
  let heatPoints: [number, number][] = [];
  let heatLoading = false;
  let heatLoaded = false;
  $: if ($settings.showHeatmap && $session && !heatLoaded && !heatLoading) {
    heatLoading = true;
    listMyTrackPoints()
      .then((pts) => {
        heatPoints = pts;
        heatLoaded = true;
      })
      .catch((e) => {
        console.error('[+page] heatmap fetch failed', e);
      })
      .finally(() => {
        heatLoading = false;
      });
  }
  // Hide heatmap when toggle is off OR the user signs out.
  $: shownHeatPoints = $settings.showHeatmap && $session ? heatPoints : [];

  /** Cache of track-id → point list so flipping a track on/off
   *  doesn't re-hit the network on the second toggle. */
  type LatLng = [number, number];
  type TrackPolyline = { id: string; points: LatLng[]; startedAt: string | null };
  let trackPointsCache: Map<string, LatLng[]> = new Map();
  /** Cache of track-id → started_at timestamp so the recency
   *  gradient (newest = red, oldest = dark blue) can be computed
   *  in Map without each track needing its own query. Filled in
   *  one batched .in('id', ids) round-trip per rebuild. */
  let trackStartedAtCache: Map<string, string | null> = new Map();
  let displayedTrackPolylines: TrackPolyline[] = [];
  /** Whenever the displayedTrackIds set changes, fetch any missing
   *  track points and rebuild the polylines list passed to Map. */
  $: void rebuildDisplayedTracks($displayedTrackIds);
  async function rebuildDisplayedTracks(ids: Set<string>) {
    const idArr = Array.from(ids);
    // Batch-fetch metadata for any displayed track we don't yet
    // have a started_at for. Single round-trip; cheap because the
    // tracks row is small (no points).
    const missingMeta = idArr.filter((id) => !trackStartedAtCache.has(id));
    if (missingMeta.length > 0) {
      try {
        const rows = await listTracksByIds(missingMeta);
        for (const r of rows) trackStartedAtCache.set(r.id, r.started_at);
        // Mark ids that didn't come back so we don't re-query forever
        // (e.g. a track was deleted but the displayed-id set is stale).
        for (const id of missingMeta) {
          if (!trackStartedAtCache.has(id)) trackStartedAtCache.set(id, null);
        }
      } catch (err) {
        console.error('[+page] track meta fetch failed', err);
      }
    }
    // Fan out missing-track fetches in parallel — earlier serial
    // loop blocked each track on the previous one.
    const fetched = await Promise.all(
      idArr.map(async (id) => {
        const cached = trackPointsCache.get(id);
        if (cached) return { id, points: cached };
        try {
          const pts = await getTrackPoints(id);
          trackPointsCache.set(id, pts);
          return { id, points: pts };
        } catch (err) {
          console.error('[+page] getTrackPoints failed', id, err);
          return null;
        }
      })
    );
    displayedTrackPolylines = fetched
      .filter((t): t is { id: string; points: LatLng[] } => t !== null && t.points.length > 1)
      .map((t) => ({ ...t, startedAt: trackStartedAtCache.get(t.id) ?? null }));
  }

  /** Bound from <Map> so we can call clearRecorder() after a save. */
  let mapRef: { clearRecorder: () => void } | null = null;
  async function handleRecordSave(e: CustomEvent<{ title: string }>) {
    const snap = stopRecording();
    if (snap.points.length < 2) return;
    try {
      const parsed = {
        title: e.detail.title,
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
        title: e.detail.title,
        visibility: 'private'
      });
      // Seed the points cache with what we just had in memory so
      // we don't have to round-trip to refetch — and add the new
      // track to the displayed set so its polyline stays on the
      // map until the user explicitly hides it.
      const latlngs: [number, number][] = snap.points.map((p) => [p.lat, p.lng]);
      trackPointsCache.set(newId, latlngs);
      // Seed the started_at cache too — snap.startedAt is ms epoch.
      // Avoids a follow-up listByIds round trip just to color the
      // freshly-saved polyline.
      if (snap.startedAt) {
        trackStartedAtCache.set(newId, new Date(snap.startedAt).toISOString());
      }
      showTrack(newId);
      mapRef?.clearRecorder();
      // Append directly to heatPoints rather than forcing a full
      // refetch — saves a paginated round-trip through up to 50k
      // existing points just to surface the freshly-saved track.
      if (heatLoaded) heatPoints = [...heatPoints, ...latlngs];
    } catch (err) {
      console.error('[+page] save recording failed', err);
      alert(err instanceof Error ? err.message : 'Could not save the recording.');
    }
  }
  // Track the last requested viewport so a stale in-flight load that
  // resolves after a newer one doesn't clobber the visible layer.
  let viewportSeq = 0;
  // Zoom threshold below which we render aggregate cluster dots
  // instead of individual pins. Bumped from 11 → 13 because the
  // anon individual-pin cap (500) gets hit easily in dense areas
  // even at zoom 11 — better to keep showing accurate cluster
  // counts than a silently truncated individual-pin set.
  const CLUSTER_BELOW_ZOOM = 13;
  /** True when the viewport pin fetch returned the maximum allowed
   *  rows — there could be more pins outside the cap. The Show
   *  dropdown appends a '+' to its counts when this is set so the
   *  user knows the numbers are floors, not totals. */
  let capHit = false;
  /** Server-side per-species count summary for the current viewport.
   *  Populated alongside the pin fetch and used to drive accurate
   *  totals in the Show dropdown and per-species counts in the
   *  filter panel. NOT subject to the 500-pin fetch cap, so the
   *  user sees real numbers even when the visible pin set is
   *  truncated. Empty array = no summary loaded yet. */
  let bboxSummary: PinBboxSummaryRow[] = [];
  let showDropPin = false;
  let dropPinLng: number | null = null;
  let dropPinLat: number | null = null;
  /** Set by the address-search dropdown; Map watches it and animates
   *  a flyTo. Pass a fresh object on every selection so the reactive
   *  block in Map sees a new reference. */
  let mapFlyTo: { lng: number; lat: number; zoom?: number } | null = null;
  function handleGeocodeSelect(
    e: CustomEvent<{ lng: number; lat: number; zoom: number; label: string }>
  ) {
    const { lng, lat, zoom } = e.detail;
    mapFlyTo = { lng, lat, zoom };
  }

  let species: Species[] = [];
  /** Species filter — session-only (not persisted). The panel's Clear
   *  / Select-all / individual-checkbox flips are ephemeral viewport
   *  filters; the long-term active set lives on /interests. Resetting
   *  on page reload is intentional.
   *   null     → no panel filter; show every species the user hasn't
   *              disabled in /interests
   *   Set([…]) → only listed species visible (empty set = show none) */
  $: selectedSpeciesIds = $panelSelection;
  let speciesPanelOpen = false;
  /** Category filter for the species panel — checkboxes that turn each
   *  category on/off. The set holds enabled categories. Brambles are
   *  their own category alongside fruit/nut/mushroom/other and get
   *  their own shape (star) on the map. */
  type SpeciesCat = 'fruit' | 'bramble' | 'nut' | 'mushroom' | 'other';
  const SPECIES_CATS: { k: SpeciesCat; label: string }[] = [
    { k: 'fruit',    label: 'Fruit trees' },
    { k: 'bramble',  label: 'Brambles' },
    { k: 'nut',      label: 'Nuts' },
    { k: 'mushroom', label: 'Mushrooms' },
    { k: 'other',    label: 'Other' }
  ];
  /** Categories whose species are visible in the panel. All on by
   *  default (matches the previous "All" tab behavior). */
  let visibleCats: Set<SpeciesCat> = new Set(['fruit', 'bramble', 'nut', 'mushroom', 'other']);
  function toggleCat(k: SpeciesCat) {
    const next = new Set(visibleCats);
    if (next.has(k)) next.delete(k); else next.add(k);
    visibleCats = next;
  }
  /** Canonical category order — drives panel-list ordering, legend
   *  ordering, and the harvest-windows page sort. */
  const CAT_ORDER: SpeciesCat[] = ['fruit', 'bramble', 'nut', 'mushroom', 'other'];

  /** Friendly group label per genus. Falls back to the genus itself if not
   *  in the mapping. Drives the indented sub-list in the species panel.
   *  Apple + Pear share a group; Almond is split out from the rest of
   *  Prunus because foragers treat it differently from cherries / plums. */
  const GROUP_LABELS: Record<string, string> = {
    Amelanchier: 'Serviceberry',
    Asimina: 'Pawpaw',
    Carya: 'Hickory',
    Castanea: 'Chestnut',
    Cornus: 'Cornelian cherry',
    Corylus: 'Hazelnut',
    Diospyros: 'Persimmon',
    Juglans: 'Walnut',
    Malus: 'Apple / Pear',
    Pyrus: 'Apple / Pear',
    Morus: 'Mulberry',
    Prunus: 'Cherry / Plum',
    Ribes: 'Currant',
    Rubus: 'Bramble',
    Sambucus: 'Elderberry',
    Vaccinium: 'Blueberry',
    Elaeagnus: 'Autumn olive',
    Vitis: 'Grape',
    // Mushrooms collapsed into one bucket.
    Cantharellus: 'Mushroom',
    Morchella: 'Mushroom',
    // Misc edibles collapsed into "Other".
    Allium: 'Other',
    Asparagus: 'Other',
    Mentha: 'Other'
  };
  function groupOf(s: Species): string {
    // Specific species overrides (almond split out from other Prunus).
    if (s.scientific_name === 'Prunus dulcis') return 'Almond';
    // Brambles split per species so raspberry / blackberry / wineberry
    // each get their own color on the map.
    if (s.scientific_name.startsWith('Rubus ')) return s.common_name;
    const genus = s.scientific_name.split(/\s+/)[0];
    return GROUP_LABELS[genus] ?? genus;
  }

  /** Group a flat species list by genus label. Sorted by canonical
   *  category order (fruit → nut → mushroom → other), then by group
   *  label alphabetically within each category bucket. The category
   *  for a group is taken from any of its species (they're all in the
   *  same group, so they'll share a category). */
  function groupSpecies(list: Species[]): [string, Species[]][] {
    const m: Record<string, Species[]> = {};
    for (const s of list) {
      const g = groupOf(s);
      if (!m[g]) m[g] = [];
      m[g].push(s);
    }
    const groupCat = (sp: Species): SpeciesCat =>
      (categoryBySpecies[sp.id] as SpeciesCat) ?? 'other';
    return Object.entries(m).sort((a, b) => {
      const ca = CAT_ORDER.indexOf(groupCat(a[1][0]));
      const cb = CAT_ORDER.indexOf(groupCat(b[1][0]));
      if (ca !== cb) return ca - cb;
      return a[0].localeCompare(b[0]);
    });
  }

  $: filteredSpeciesList = speciesInRegion.filter((s) => {
    const cat = (categoryBySpecies[s.id] as SpeciesCat) ?? 'other';
    return visibleCats.has(cat);
  });
  $: groupedSpecies = groupSpecies(filteredSpeciesList);
  type FilterStatus =
    | 'all'
    | 'active'
    | 'edible_today'
    | 'productive';
  let filterStatus: FilterStatus = 'active';
  /** Per-pin source category for the layers panel. Today the
   *  friend-graph doesn't exist yet, so 'friends' is unreachable;
   *  the toggle stays in the UI as a no-op until that lands. */
  type PinSource = 'mine' | 'friends' | 'group' | 'public';
  $: myUserId = $profile?.id ?? null;
  function sourceOf(p: PinEffective): PinSource {
    if (myUserId && p.created_by === myUserId) return 'mine';
    if (p.visibility === 'public') return 'public';
    return 'group';
  }
  let layersPanelOpen = false;
  /** Mobile-only: whether the collapsed filter controls are
   *  expanded. On desktop the controls are always inline and this
   *  state is irrelevant — see the @media rule in styles. */
  let filtersPanelOpen = false;
  function onLayerToggle(key: MapLayerKey, e: Event) {
    setMapLayer(key, (e.currentTarget as HTMLInputElement).checked);
  }
  function onZonesToggle(e: Event) {
    setShowZones((e.currentTarget as HTMLInputElement).checked);
  }
  /** Brief 'X / Y on' summary for the panel button. */
  $: layersOnCount = (() => {
    const m = $settings.mapLayers;
    return [m.mine, m.friends, m.group, m.public, m.tracks].filter(Boolean).length;
  })();
  let showLegend = true;

  /** Cookbook filter — show only species whose preparation_methods
   *  include the chosen value. Empty string = no filter. The list of
   *  available methods is derived from the species catalog so newly
   *  curated methods automatically appear. */
  let cookbookFilter = '';
  /** Available 'Make' methods with the per-method *active* pin count
   *  in the current viewport. Uses active_count from bboxSummary so
   *  the number stays consistent with the Show dropdown's default
   *  Active filter, and applies the same species/category gates so
   *  hidden categories or disabled species don't sneak into the
   *  Make total when they're absent from the All total. Sorted by
   *  count desc so most-stocked methods come first. */
  $: availableCookbookMethods = (() => {
    const counts = new Map<string, number>();
    const activeBySpecies = new Map<string, number>();
    for (const r of bboxSummary) {
      if (r.species_id) activeBySpecies.set(r.species_id, r.active_count);
    }
    for (const s of speciesInRegion) {
      const methods = s.preparation_methods ?? [];
      if (methods.length === 0) continue;
      // Same gates the Show counts use — keeps the two consistent
      // when the user has hidden categories or disabled species.
      if ($disabledIds.has(s.id)) continue;
      const cat = (categoryBySpecies[s.id] ?? null) as SpeciesCat | null;
      if (cat && !visibleCats.has(cat)) continue;
      const c = activeBySpecies.get(s.id)
        ?? pins.filter((p) => p.species_id === s.id && p.effective_status === 'active').length;
      if (c === 0) continue;
      for (const m of methods) {
        const key = m?.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + c);
      }
    }
    return Array.from(counts.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count || a.method.localeCompare(b.method));
  })();
  // If the user picked a method and then panned away from species
  // that support it, clear the filter so it doesn't silently keep
  // hiding everything.
  $: if (cookbookFilter && !availableCookbookMethods.some((m) => m.method === cookbookFilter)) {
    cookbookFilter = '';
  }
  /** Set of species_ids whose preparation_methods include cookbookFilter.
   *  null when no cookbook filter is active. Computed once per change
   *  rather than per pin in the filter loop. */
  $: cookbookSpeciesIds = (() => {
    if (!cookbookFilter) return null;
    const out = new Set<string>();
    for (const s of species) {
      if ((s.preparation_methods ?? []).includes(cookbookFilter)) out.add(s.id);
    }
    return out;
  })();


  let selectedPinId: string | null = null;

  type Cat = 'fruit' | 'bramble' | 'nut' | 'mushroom' | 'other' | 'unknown';
  type CatMap = Record<string, Cat>;

  function buildCategoryMap(speciesList: Species[]): CatMap {
    const m: CatMap = {};
    for (const s of speciesList) {
      const parts = s.forage_parts ?? [];
      // Brambles (Rubus) get their own category — they're forage-relevant
      // in a different way than tree fruits (canes vs trees, harvest
      // technique, ripeness behavior).
      const isBramble = s.scientific_name.startsWith('Rubus');
      let cat: Cat = 'other';
      if (isBramble) cat = 'bramble';
      else if (parts.includes('mushroom')) cat = 'mushroom';
      else if (parts.includes('nut')) cat = 'nut';
      else if (parts.includes('fruit')) cat = 'fruit';
      // everything else (leaf, shoot, bulb, root, spice, bark, …) → 'other'
      m[s.id] = cat;
    }
    return m;
  }

  $: categoryBySpecies = buildCategoryMap(species);
  $: categoryOf = (p: PinEffective): Cat =>
    p.species_id ? categoryBySpecies[p.species_id] ?? 'unknown' : 'unknown';

  $: speciesById = (() => {
    const m: Record<string, Species> = {};
    for (const s of species) m[s.id] = s;
    return m;
  })();

  function groupOfPin(p: PinEffective): string {
    const s = p.species_id ? speciesById[p.species_id] : null;
    return s ? groupOf(s) : '';
  }
  $: colorOfPin = (p: PinEffective): string => {
    // 'category' mode: every pin uses its category-default color.
    // Useful when a user has many active species and per-group hues
    // start to feel busy.
    if ($settings.colorBy === 'category') {
      const cat = p.species_id ? categoryBySpecies[p.species_id] : null;
      return colorForCategoryFallback(cat as Cat);
    }
    const g = groupOfPin(p);
    if (g) return colorForGroup(g);
    // No species or unknown group → category-fallback neutral.
    const cat = p.species_id ? categoryBySpecies[p.species_id] : null;
    return colorForCategoryFallback(cat as Cat);
  };

  /** Color for a group label, honoring the user's colorBy preference.
   *  Used by the species panel + legend (rendering swatches without a
   *  specific pin to call colorOfPin on). */
  $: colorForGroupLabel = (groupName: string, sample: Species | undefined): string => {
    if ($settings.colorBy === 'category') {
      const cat = sample ? (categoryBySpecies[sample.id] as Cat | undefined) ?? null : null;
      return colorForCategoryFallback(cat);
    }
    return colorForGroup(groupName);
  };

  /** Map a group label to one of the legend-shape glyphs based on the
   *  category of any species in the group. (All species in a group
   *  share a category, so picking the first works.) */
  function shapeForGroup(group: string): 'circle' | 'square' | 'triangle' | 'diamond' | 'star' {
    const sp = speciesInRegion.find((s) => groupOf(s) === group);
    const cat = sp ? categoryBySpecies[sp.id] : null;
    if (cat === 'bramble') return 'star';
    if (cat === 'nut') return 'square';
    if (cat === 'mushroom') return 'triangle';
    if (cat === 'other') return 'diamond';
    return 'circle';
  }

  /** Groups currently represented on the visible map, deduplicated and
   *  sorted: by category (fruit → nut → mushroom → other), then by
   *  group name within. Drives the per-group legend. */
  $: visibleGroups = (() => {
    const seen = new Set<string>();
    const out: { group: string; cat: SpeciesCat; color: string; shape: ReturnType<typeof shapeForGroup> }[] = [];
    for (const p of filteredPins) {
      const g = groupOfPin(p);
      if (!g || seen.has(g)) continue;
      seen.add(g);
      const cat = (p.species_id ? categoryBySpecies[p.species_id] : null) as SpeciesCat | null;
      out.push({
        group: g,
        cat: cat ?? 'other',
        color: colorOfPin(p),
        shape: shapeForGroup(g)
      });
    }
    return out.sort((a, b) => {
      const ca = CAT_ORDER.indexOf(a.cat);
      const cb = CAT_ORDER.indexOf(b.cat);
      if (ca !== cb) return ca - cb;
      return a.group.localeCompare(b.group);
    });
  })();

  function labelOf(p: PinEffective): string {
    const s = p.species_id ? speciesById[p.species_id] : null;
    // Species first, display_name only as a fallback for legacy pins
    // that were created before the name field was removed.
    const name = s?.common_name ?? p.display_name ?? '(unnamed pin)';
    const status =
      p.effective_status === 'active' ? '' : ` [${p.effective_status}]`;
    const ripe = p.is_edible_now ? '  · 🌿 edible now' : '';
    // Visibility tag: only 🔒 private. The previous '🌐 public'
    // tag was ambiguous — it referred to dataset visibility but
    // read as 'on public land,' which is a separate property
    // (access_status) and could be wrong (e.g. a city-inventory
    // tree on private property). Land-access info should come
    // from access_status alone.
    const visTag =
      p.visibility === 'private' ? '  · 🔒 private' : '';
    return `${name}${status}${ripe}${visTag}`;
  }

  $: filteredPins = pins.filter((p) => {
    // Layer-source filter (mine / friends / group / public).
    if (!$settings.mapLayers[sourceOf(p)]) return false;
    // Category filter (Fruit trees / Brambles / Nuts / Mushrooms / Other).
    const cat = (p.species_id ? categoryBySpecies[p.species_id] : null) as SpeciesCat | null;
    if (cat && !visibleCats.has(cat)) return false;
    // Species filter
    // Species filter uses the deny-list ($disabledIds): a species the
    // user hasn't expressed an opinion on stays visible, which matters
    // for the public layer (NYC street trees, etc. that aren't in the
    // user's Ithaca-scoped opt-in list).
    if (p.species_id && $disabledIds.has(p.species_id)) return false;
    // Cookbook filter — pin's species must have the chosen prep method.
    if (cookbookSpeciesIds !== null) {
      if (!p.species_id || !cookbookSpeciesIds.has(p.species_id)) return false;
    }
    // Status filter — progressively narrower
    if (filterStatus === 'all') return true;

    // 'active' = exists, hasn't been marked gone/dormant/needs_verification.
    // Accessibility (out_of_reach, inaccessible, fenced, private_property) is
    // a hazard tag, not a status — those pins still count as active.
    const isActive = p.effective_status === 'active';
    if (!isActive) return false;
    if (filterStatus === 'active') return true;

    if (filterStatus === 'edible_today') return p.is_edible_now === true;
    if (filterStatus === 'productive') return p.has_ripe_observation_ever === true;
    return true;
  });

  /** Predicate for each filter-status option, used for counts shown in
   *  the Show dropdown. The predicates apply to the species-filtered
   *  pin set so the user sees how many of *currently visible species*
   *  match each status — not the global region totals. */
  function matchesStatus(p: PinEffective, status: FilterStatus): boolean {
    if (status === 'all') return true;
    const isActive = p.effective_status === 'active';
    if (!isActive) return false;
    if (status === 'active') return true;
    if (status === 'edible_today') return p.is_edible_now === true;
    if (status === 'productive') return p.has_ripe_observation_ever === true;
    return false;
  }
  /** Pins after the species/category filters but before the status
   *  filter — used as the denominator for counts in the dropdown. */
  $: speciesFilteredPins = pins.filter((p) => {
    // Same deny-list semantics as filteredPins above.
    return !(p.species_id && $disabledIds.has(p.species_id));
  }).filter((p) => {
    const cat = (p.species_id ? categoryBySpecies[p.species_id] : null) as SpeciesCat | null;
    return !cat || visibleCats.has(cat);
  }).filter((p) => {
    if (cookbookSpeciesIds === null) return true;
    return p.species_id ? cookbookSpeciesIds.has(p.species_id) : false;
  });
  $: statusCounts = (() => {
    const out: Record<FilterStatus, number> = {
      all: 0, active: 0, edible_today: 0, productive: 0
    };
    // edible_today and productive depend on per-pin booleans only
    // available in the heavier v_pin_effective view. Count those from
    // the in-memory pin set; the '+' suffix on the dropdown still
    // signals capHit. all and active come from the server-side
    // summary when available so they're accurate even when the pin
    // fetch is capped.
    for (const p of speciesFilteredPins) {
      if (matchesStatus(p, 'edible_today')) out.edible_today++;
      if (matchesStatus(p, 'productive'))    out.productive++;
    }
    if (bboxSummary.length > 0) {
      for (const r of bboxSummary) {
        // Apply the same species/category/cookbook gates the in-memory
        // path applies, so the dropdown counts match what the species
        // panel offers. A null species_id can't be filtered by these
        // species-level predicates, so it's always included.
        if (r.species_id) {
          if ($disabledIds.has(r.species_id)) continue;
          const cat = (categoryBySpecies[r.species_id] ?? null) as SpeciesCat | null;
          if (cat && !visibleCats.has(cat)) continue;
          if (cookbookSpeciesIds !== null && !cookbookSpeciesIds.has(r.species_id)) continue;
        } else if (cookbookSpeciesIds !== null) {
          continue;
        }
        out.all    += r.total_count;
        out.active += r.active_count;
      }
    } else {
      for (const p of speciesFilteredPins) {
        if (matchesStatus(p, 'all'))    out.all++;
        if (matchesStatus(p, 'active')) out.active++;
      }
    }
    return out;
  })();

  // Reactive function so checkboxes re-render when selectedSpeciesIds changes.
  $: isSelected = (id: string) =>
    selectedSpeciesIds === null || selectedSpeciesIds.has(id);

  /** Which legend rows are worth showing — only categories actually
   *  present in the visible pin set, plus ripe/possibly indicators only
   *  if any pin currently has them, plus the gone/dormant row only when
   *  the user is showing all statuses. */
  $: legendShows = (() => {
    const cats = { fruit: false, nut: false, mushroom: false, other: false };
    let ripe = false, possibly = false, gone = false;
    for (const p of filteredPins) {
      const cat = p.species_id ? categoryBySpecies[p.species_id] : null;
      if (cat === 'fruit') cats.fruit = true;
      else if (cat === 'nut') cats.nut = true;
      else if (cat === 'mushroom') cats.mushroom = true;
      else cats.other = true;
      if (p.is_edible_strict) ripe = true;
      else if (p.is_edible_now) possibly = true;
      if (
        p.effective_status === 'gone' ||
        p.effective_status === 'inaccessible' ||
        p.effective_status === 'not_good' ||
        p.effective_status === 'dormant'
      ) gone = true;
    }
    return {
      fruit: cats.fruit,
      nut: cats.nut,
      mushroom: cats.mushroom,
      other: cats.other,
      ripe,
      possibly,
      // Gone/dormant only shows when the user is actually viewing them.
      gone: gone && filterStatus === 'all'
    };
  })();

  function toggleSpecies(id: string) {
    const allIds = speciesInRegion.map((s) => s.id);
    togglePanelSelection(id, allIds);
  }
  function clearSpecies() {
    // Session-only: empties the panel filter. Species stay in the
    // dropdown unchecked so they can be re-checked individually.
    clearPanelSelection();
  }
  function selectAllSpecies() {
    // Session-only: removes the panel filter (back to "show all").
    selectAllPanelSelection();
  }

  // Sort species by common name; only include species that have at least
  // one pin in the active region for compactness.
  // Order categories so the panel groups fruits, then nuts, then mushrooms,
  // then greens, then other. Within a category, sort by scientific name so
  // same-genus species cluster (all Amelanchier together, etc).
  const CATEGORY_ORDER: Record<string, number> = {
    fruit: 0, nut: 1, mushroom: 2, greens: 3, other: 4, unknown: 5
  };
  $: speciesInRegion = (() => {
    // Union of species ids appearing in the fetched pin set AND in
    // the server-side summary, so species whose individual pins fell
    // outside the 500-pin cap still appear in the filter panel.
    const ids = new Set(pins.map((p) => p.species_id).filter(Boolean));
    for (const r of bboxSummary) if (r.species_id) ids.add(r.species_id);
    return species
      // Species the user has explicitly disabled in /interests are
      // hidden from the filter panel entirely — disabled means "I'm
      // not foraging this," so it doesn't belong in the active-species
      // chooser. Re-enabling happens on the /interests page.
      .filter((s) => ids.has(s.id) && !$disabledIds.has(s.id))
      .sort((a, b) => {
        const ca = CATEGORY_ORDER[categoryBySpecies[a.id] ?? 'unknown'] ?? 9;
        const cb = CATEGORY_ORDER[categoryBySpecies[b.id] ?? 'unknown'] ?? 9;
        if (ca !== cb) return ca - cb;
        return a.scientific_name.localeCompare(b.scientific_name);
      });
  })();
  /** Server-accurate per-species pin count for the species panel.
   *  Falls back to the in-memory count from `pins` when the summary
   *  hasn't loaded yet (heatmap mode, pre-first-fetch, error). */
  $: speciesCountById = (() => {
    if (bboxSummary.length === 0) return null;
    const m = new Map<string, number>();
    for (const r of bboxSummary) if (r.species_id) m.set(r.species_id, r.total_count);
    return m;
  })();
  function summaryCountFor(speciesId: string): number {
    const fromSummary = speciesCountById?.get(speciesId);
    if (fromSummary !== undefined) return fromSummary;
    return pins.filter((p) => p.species_id === speciesId).length;
  }

  $: if (!$regionsLoading && $session && $myRegions.length === 0) {
    goto('/no-regions', { replaceState: true });
  }

  // Both authed (region-scoped) and anon (public-scoped) paths now
  // fetch pins viewport-driven via handleViewportChange. The reactive
  // here only ensures the species catalog is loaded and re-fires the
  // current-viewport fetch when activeRegion or dataChange changes.
  // The Map component dispatches its first viewportChange on mount,
  // which kicks off the initial pin fetch automatically.
  $: if ($activeRegion) {
    void $dataChange;
    loadSpeciesCatalog();
    void refetchViewport();
  } else if (!$session && !$regionsLoading) {
    void $dataChange;
    loadSpeciesCatalog();
    void refetchViewport();
  }

  // Granular update: when a single pin changes (observation logged,
  // status flipped, location moved), patch just that pin in the
  // local pins array instead of refetching the whole region. The
  // version counter on pinChanged makes the reactive fire on every
  // change even if the same pin id is bumped repeatedly.
  let lastPinChangeV = -1;
  $: if ($pinChanged && $pinChanged.v !== lastPinChangeV && $activeRegion) {
    lastPinChangeV = $pinChanged.v;
    void patchOnePin($pinChanged.pinId);
  }
  async function patchOnePin(pinId: string) {
    try {
      const fresh = await getEffectivePin(pinId);
      if (!fresh) {
        // Pin was deleted — drop from local state.
        pins = pins.filter((p) => p.id !== pinId);
        return;
      }
      const idx = pins.findIndex((p) => p.id === pinId);
      if (idx === -1) {
        // New-to-this-page pin — append.
        pins = [...pins, fresh];
      } else {
        const next = pins.slice();
        next[idx] = fresh;
        pins = next;
      }
    } catch (err) {
      console.error('[+page] patchOnePin failed', err);
    }
  }

  // Deep-link: /?pin=ID opens that pin's detail panel on load. Used by
  // the harvest-windows drill-down to "Open pin" → land here.
  $: {
    const want = $page.url.searchParams.get('pin');
    if (want && want !== selectedPinId) selectedPinId = want;
  }

  // Deep-link: /?species=ID narrows the species filter to just that
  // species. Used by the "Show pins of this species on the map" link
  // on /species/[id]. We apply once per param value (the lastApplied
  // gate stops re-fires) and only after species are loaded so the
  // userPreferences materialization knows the full id set. Authed
  // only — the persistent prefs store has nowhere to write for anon.
  let lastSpeciesParam: string | null = null;
  $: {
    const want = $page.url.searchParams.get('species');
    if (
      want &&
      want !== lastSpeciesParam &&
      species.length > 0 &&
      $session &&
      species.some((s) => s.id === want)
    ) {
      lastSpeciesParam = want;
      // Session-only: focus the panel filter on this single species
      // so the map highlights it. The persistent /interests selection
      // is unchanged.
      panelSelection.set(new Set([want]));
    }
  }

  /** Species catalog — cheap, cached at the service layer, used by
   *  both authed and anon. Pins are no longer fetched here. */
  async function loadSpeciesCatalog() {
    try {
      species = await listSpecies();
    } catch (err) {
      console.error('[+page] loadSpeciesCatalog error', err);
      species = [];
    }
  }

  /** Last bbox + zoom received from Map's viewportChange event. We
   *  cache them so events that aren't viewport-driven (a pin saved
   *  off the drop-pin modal, a dataChange bump, an active-region
   *  switch) can refetch without needing the Map to re-emit. */
  let lastBbox: Bbox | null = null;
  let lastZoom: number | null = null;

  /** Run the same fetch the viewport-change handler would run, but
   *  using the cached bbox+zoom. No-op until the Map has dispatched
   *  at least once; on first mount, the handler runs for both
   *  branches anyway, so skipping until we have geometry is safe. */
  async function refetchViewport(): Promise<void> {
    if (!lastBbox || lastZoom == null) return;
    await fetchForViewport(lastBbox, lastZoom);
  }

  /** Pin fetch for a given viewport. Region-scoped when authed +
   *  in-region; public-scoped otherwise. Uses cluster aggregates at
   *  low zoom so a continental view doesn't render tens of thousands
   *  of points. The viewportSeq guard discards stale responses when
   *  the user pans fast. When the pin-heatmap toggle is on, we
   *  always fetch individual pins (capped high) and pass coordinates
   *  to the Map's heat-dot renderer instead of going through clusters
   *  — clusters give a tile-circle visual that the user (rightly)
   *  found terrible. */
  /** Pre-aggregated density buckets for the heatmap (zoom < 13).
   *  For authed users in a region, includes BOTH the pre-computed
   *  public pin_density_grid AND a live aggregation of region-
   *  private pins — so adding or removing a pin shows up on the
   *  next viewport fetch automatically, no triggers needed. */
  let pinDensityBuckets: PinDensityBucket[] = [];
  async function fetchForViewport(bbox: Bbox, zoom: number): Promise<void> {
    const seq = ++viewportSeq;
    pinsLoading = true;
    const region = $activeRegion;
    const useRegion = !!$session && !!region;
    try {
      if (zoom < CLUSTER_BELOW_ZOOM) {
        // Heatmap mode (zoom < 13): always use the public density
        // grid. Imported region pins (Ithaca, NYC, Boston…) all carry
        // visibility='public', so they're already in the public grid;
        // querying the per-region grid in addition would double-count
        // them at every cell. User-created private/shared pins are
        // rare in this view and only contribute meaningfully at zoom
        // ≥ 13 where the merge below pulls them in.
        const buckets = await listPublicPinDensity(bbox, zoom);
        if (seq !== viewportSeq) return;
        pinDensityBuckets = buckets;
        pins = [];
        clusters = [];
        capHit = false;
        bboxSummary = [];
      } else {
        // Individual-pin mode (zoom ≥ 13): authed users get their
        // region pins ∪ the public layer (dedup by id) so panning
        // outside their region still shows the global public dataset.
        // The summary RPCs run in parallel for accurate counts even
        // when the pin lists hit their caps.
        const ownCap = 1000;
        const pubCap = 500;
        const [own, pub, ownSum, pubSum] = await Promise.all([
          useRegion && region ? listRegionPins(region.id, bbox, ownCap) : Promise.resolve([]),
          listPublicPins(bbox, pubCap),
          useRegion && region ? listRegionPinSummary(region.id, bbox) : Promise.resolve([] as PinBboxSummaryRow[]),
          listPublicPinSummary(bbox)
        ]);
        if (seq !== viewportSeq) return;
        // PinEffective.id is typed nullable (view-derived) but is in
        // practice never null — coalesce to '' for the Set key just to
        // keep TypeScript happy without a runtime branch.
        const seen = new Set<string>();
        const merged: PinEffective[] = [];
        for (const p of own) { const k = p.id ?? ''; if (!seen.has(k)) { merged.push(p); seen.add(k); } }
        for (const p of pub) { const k = p.id ?? ''; if (!seen.has(k)) { merged.push(p); seen.add(k); } }
        pins = merged;
        clusters = [];
        pinDensityBuckets = [];
        capHit = own.length >= ownCap || pub.length >= pubCap;
        // Merge per-species summary rows. The same species might
        // appear in both region and public sets (imports live in
        // both); region rows take precedence since they include the
        // user's own non-public contributions on top of the imports.
        const summaryById = new Map<string | null, PinBboxSummaryRow>();
        for (const r of pubSum) summaryById.set(r.species_id, r);
        for (const r of ownSum) {
          const existing = summaryById.get(r.species_id);
          if (existing) {
            // The intersection (imports) shows up in both — keep the
            // larger of the two counts rather than summing, since
            // summing would double-count public imports.
            summaryById.set(r.species_id, {
              species_id: r.species_id,
              active_count: Math.max(existing.active_count, r.active_count),
              total_count: Math.max(existing.total_count, r.total_count)
            });
          } else {
            summaryById.set(r.species_id, r);
          }
        }
        bboxSummary = [...summaryById.values()];
      }
    } catch (err) {
      console.error('[+page] fetchForViewport error', err);
      if (seq === viewportSeq) {
        pins = [];
        clusters = [];
        pinDensityBuckets = [];
        bboxSummary = [];
      }
    } finally {
      if (seq === viewportSeq) pinsLoading = false;
    }
  }

  async function handleViewportChange(
    e: CustomEvent<{ bbox: Bbox; zoom: number }>
  ) {
    lastBbox = e.detail.bbox;
    lastZoom = e.detail.zoom;
    // Persist center + zoom so navigation away (and back) restores
    // the user's view instead of resetting to defaults.
    const [west, south, east, north] = e.detail.bbox;
    setMapViewport({
      lat: (south + north) / 2,
      lng: (west + east) / 2,
      zoom: e.detail.zoom
    });
    await fetchForViewport(e.detail.bbox, e.detail.zoom);
  }

  function handlePinClick(e: CustomEvent<{ pinId: string }>) {
    selectedPinId = e.detail.pinId;
  }

  function closePanel() {
    selectedPinId = null;
  }

  function onPanelStatusChanged() {
    // No-op: pinService.updateStatus already calls bumpPinChanged,
    // which triggers patchOnePin via the reactive above. Earlier
    // code here also fired a region-wide loadAll, doubling the
    // round-trip and the render churn.
  }

  async function handleMapTap(e: CustomEvent<{ lng: number; lat: number }>) {
    // Move-pin flow takes precedence: if we're moving an existing
    // pin, the next tap relocates it (and skips the drop-pin modal).
    if (movingPinId) {
      const id = movingPinId;
      movingPinId = null;
      try {
        await updatePinLocation(id, e.detail.lng, e.detail.lat);
      } catch (err) {
        console.error('[+page] move pin failed', err);
        alert('Could not move the pin. ' + (err instanceof Error ? err.message : ''));
      }
      return;
    }
    dropPinLng = e.detail.lng;
    dropPinLat = e.detail.lat;
    showDropPin = true;
    placingPin = false; // exit placement mode once a coord is picked
  }

  function handlePinSaved(_e: CustomEvent<{ id: string }>) {
    showDropPin = false;
    dropPinLng = null;
    dropPinLat = null;
    // Refetch the current viewport so the just-created pin appears.
    // bumpDataChange would also trigger this via the reactive above
    // but we kick it directly here so the user sees their pin without
    // waiting on whatever else listens to dataChange.
    void refetchViewport();
  }

  function handleClose() {
    showDropPin = false;
    dropPinLng = null;
    dropPinLat = null;
  }

  /** Desktop "+" button: enter placement mode rather than dropping a
   *  pin at the user's current GPS location. The next click on empty
   *  map area picks the coordinate; Escape cancels. */
  let placingPin = false;
  function handleNewPinClick() {
    placingPin = true;
  }

  /** "Move pin" flow: when set, the next mapTap relocates this pin
   *  instead of opening the drop-pin modal. The pin detail panel is
   *  closed so the user can see the map and the relocation hint. */
  let movingPinId: string | null = null;
  function handleRequestMove(e: CustomEvent<{ pinId: string }>) {
    movingPinId = e.detail.pinId;
    selectedPinId = null; // close the panel so the map is fully visible
  }

  function handlePlacingKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (placingPin) placingPin = false;
    if (movingPinId) movingPinId = null;
  }
</script>

<svelte:window on:keydown={handlePlacingKey} />

<div class="map-page">
<header>
  <h1>Forager</h1>
  {#if $activeRegion}
    <span class="region-badge">{$activeRegion.name}</span>
  {/if}
  <div class="meta">
    {#if pinsLoading}
      <span class="hint">Loading…</span>
    {/if}
    {#if $session}
      <a class="link ripe-link" href={base + '/ripe'}>Ripe now</a>
    {/if}
    <ToolsMenu />
  </div>
</header>

{#if !$session}
  <SignupBanner />
{/if}

{#if $activeRegion || (!$session && !$regionsLoading)}
  <div class="filterbar">
    <!-- Mobile-only toggle. Hidden on >640px screens via the
         media query; on phones it collapses every filter control
         (species/show/make/layers) behind one tap so the bar stays
         narrow enough for AddressSearch to coexist on a single row. -->
    <button
      class="filterbar-mobile-toggle"
      on:click={() => (filtersPanelOpen = !filtersPanelOpen)}
      aria-expanded={filtersPanelOpen}
      title="Show or hide filter controls"
    >
      Filters
      <span class="caret">{filtersPanelOpen ? '▴' : '▾'}</span>
    </button>
    <div class="filterbar-controls" class:open={filtersPanelOpen}>
    <div class="species-filter">
      <button
        class="species-toggle"
        on:click={() => (speciesPanelOpen = !speciesPanelOpen)}
      >
        Species:
        {#if selectedSpeciesIds === null}
          All ({speciesInRegion.length})
        {:else if selectedSpeciesIds.size === 0}
          None
        {:else}
          {selectedSpeciesIds.size} selected
        {/if}
        <span class="caret">{speciesPanelOpen ? '▴' : '▾'}</span>
      </button>

      {#if speciesPanelOpen}
        <div class="species-panel">
          <div class="species-panel-actions">
            <button on:click={selectAllSpecies}>Select all</button>
            <button on:click={clearSpecies}>Clear</button>
            <button on:click={() => (speciesPanelOpen = false)}>Done</button>
          </div>
          <div class="species-cats">
            {#each SPECIES_CATS as cat}
              {@const count = speciesInRegion.filter(
                (s) => (categoryBySpecies[s.id] ?? 'other') === cat.k
              ).length}
              {#if count > 0}
                <label class="cat-toggle">
                  <input
                    type="checkbox"
                    checked={visibleCats.has(cat.k)}
                    on:change={() => toggleCat(cat.k)}
                  />
                  {cat.label}
                  <span class="count">{count}</span>
                </label>
              {/if}
            {/each}
          </div>
          <ul class="species-list">
            {#each groupedSpecies as [groupName, list]}
              {@const shape = shapeForGroup(groupName)}
              {@const color = colorForGroupLabel(groupName, list[0])}
              <li class="group-header">
                {#if shape === 'triangle'}
                  <span class="legend-shape triangle" style="border-bottom-color: {color};"></span>
                {:else if shape === 'star'}
                  <svg class="legend-shape" width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                    <polygon
                      points="7,1 8.6,5.5 13.5,5.5 9.5,8.5 11.1,13 7,10 2.9,13 4.5,8.5 0.5,5.5 5.4,5.5"
                      fill={color} stroke="#1f2a1f" stroke-width="1" stroke-linejoin="round" />
                  </svg>
                {:else}
                  <span class="legend-shape {shape}" style="background: {color};"></span>
                {/if}
                {groupName}
              </li>
              {#each list as s}
                <li class="indented">
                  <label>
                    <input
                      type="checkbox"
                      checked={isSelected(s.id)}
                      on:change={() => toggleSpecies(s.id)}
                    />
                    <span class="sp-name">{s.common_name}</span>
                    <span class="count">({summaryCountFor(s.id)})</span>
                  </label>
                </li>
              {/each}
            {/each}
          </ul>
        </div>
      {/if}
    </div>
    <label>
      Show:
      <select bind:value={filterStatus}>
        <option value="all">All ({statusCounts.all})</option>
        <option value="active">Active ({statusCounts.active})</option>
        <option value="edible_today">Edible today ({statusCounts.edible_today}{capHit ? '+' : ''})</option>
        <option value="productive">Productive ({statusCounts.productive}{capHit ? '+' : ''})</option>
      </select>
    </label>
    {#if availableCookbookMethods.length > 0}
      <label>
        Make:
        <select bind:value={cookbookFilter}>
          <option value="">— anything —</option>
          {#each availableCookbookMethods as m}
            <option value={m.method}>{m.method.replace(/_/g, ' ')} ({m.count})</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if $session}
      <div class="layers-filter">
        <button
          class="layers-toggle"
          on:click={() => (layersPanelOpen = !layersPanelOpen)}
          title="Show or hide pin sources on the map"
        >
          Layers: {layersOnCount}/5
          <span class="caret">{layersPanelOpen ? '▴' : '▾'}</span>
        </button>
        {#if layersPanelOpen}
          <div class="layers-panel">
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.mapLayers.mine}
                on:change={(e) => onLayerToggle('mine', e)}
              />
              <span class="layer-name">Mine</span>
              <span class="layer-hint">Pins I created</span>
            </label>
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.mapLayers.friends}
                on:change={(e) => onLayerToggle('friends', e)}
              />
              <span class="layer-name">Friends</span>
              <span class="layer-hint">No-op until friend graph ships</span>
            </label>
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.mapLayers.group}
                on:change={(e) => onLayerToggle('group', e)}
              />
              <span class="layer-name">Group</span>
              <span class="layer-hint">Region members' pins</span>
            </label>
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.mapLayers.public}
                on:change={(e) => onLayerToggle('public', e)}
              />
              <span class="layer-name">Public</span>
              <span class="layer-hint">City inventories + community-shared</span>
            </label>
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.mapLayers.tracks}
                on:change={(e) => onLayerToggle('tracks', e)}
              />
              <span class="layer-name">Tracks</span>
              <span class="layer-hint">Saved track polylines</span>
            </label>
            <label class="layer-row">
              <input
                type="checkbox"
                checked={$settings.showZones}
                on:change={onZonesToggle}
              />
              <span class="layer-name">USDA zones</span>
              <span class="layer-hint">Plant Hardiness overlay (US only)</span>
            </label>
          </div>
        {/if}
      </div>
    {/if}
    </div>
    <div class="filterbar-spacer"></div>
    <AddressSearch on:select={handleGeocodeSelect} />
  </div>

  <MapView
    bind:this={mapRef}
    pins={filteredPins}
    {clusters}
    {pinDensityBuckets}
    heatPoints={shownHeatPoints}
    displayedTracks={$settings.mapLayers.tracks ? displayedTrackPolylines : []}
    colorTracksByDate={$settings.colorTracksByDate}
    showZones={$settings.showZones}
    showRecorder={!!$session}
    {categoryOf}
    colorOf={colorOfPin}
    {labelOf}
    {selectedPinId}
    basemap={$settings.basemap}
    center={[$mapViewport.lat, $mapViewport.lng]}
    zoom={$mapViewport.zoom}
    placing={placingPin || !!movingPinId}
    placingHint={movingPinId ? 'Click on the map to set the new location · Esc to cancel' : 'Click on the map to place the pin · Esc to cancel'}
    hideLocate={!!selectedPinId}
    flyTo={mapFlyTo}
    on:pinClick={handlePinClick}
    on:mapTap={handleMapTap}
    on:viewportChange={handleViewportChange}
    on:recordSave={handleRecordSave}
  />

  {#if !selectedPinId}
    {@const hasStatusRows = legendShows.ripe || legendShows.possibly || legendShows.gone}
    {#if hasStatusRows && showLegend}
      <!-- Status legend only — species/groups are listed in the species
           filter panel (each group header shows its shape + color). -->
      <div class="legend">
        <div class="legend-header">
          <strong>Status</strong>
          <button class="legend-toggle" on:click={() => (showLegend = false)} aria-label="Hide legend">−</button>
        </div>
        <ul>
          {#if legendShows.ripe}<li><span class="ring1"></span> Ripe</li>{/if}
          {#if legendShows.possibly}<li><span class="ring2"></span> Possibly ripe</li>{/if}
          {#if legendShows.gone}<li><span class="dot faded" style="background:#c14a3a"></span> Inactive (Gone / Inaccessible / Not good)</li>{/if}
        </ul>
      </div>
    {:else if hasStatusRows}
      <!-- Show the "Legend" button only when there's actually a status
           legend hidden — clicking it when there's nothing to reveal
           was the source of "the button does nothing." -->
      <button class="legend-show" on:click={() => (showLegend = true)}>Legend</button>
    {/if}
  {/if}
{:else if $regionsLoading}
  <main class="loading"><p>Loading…</p></main>
{/if}
</div>

{#if $activeRegion && !selectedPinId}
  <button
    class="new-pin-fab"
    on:click={handleNewPinClick}
    aria-label={$online ? 'New pin' : 'You are offline'}
    title={$online ? 'Add a new pin' : 'You are offline — pins can\'t be saved until you reconnect'}
    disabled={!$online}
  >+</button>
{/if}

{#if showDropPin && $activeRegion}
  <DropPinModal
    regionId={$activeRegion.id}
    initialLng={dropPinLng}
    initialLat={dropPinLat}
    on:close={handleClose}
    on:saved={handlePinSaved}
  />
{/if}

{#if selectedPinId}
  <aside class="pin-panel" role="dialog" aria-label="Pin detail">
    <header class="panel-header">
      <h2>Pin</h2>
      <div class="panel-actions">
        <a class="link" href={`/pins/${selectedPinId}`} title="Open in full page">↗</a>
        <button class="close" on:click={closePanel} aria-label="Close">×</button>
      </div>
    </header>
    <PinDetailContent
      pinId={selectedPinId}
      on:statusChanged={onPanelStatusChanged}
      on:requestMove={handleRequestMove}
    />
  </aside>
{/if}

<style>
  /* Flex column so the map auto-fills whatever vertical space is
     left after header + banner + filter bar, instead of relying on
     a hardcoded calc(100vh - 100px) that broke when the SignupBanner
     was added for anon viewers (the banner pushed the map below the
     viewport, hiding the attribution + zoom chip). */
  .map-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px;
    box-sizing: border-box;
  }
  header h1 {
    margin: 0;
    font-size: 1.05rem;
    color: #3a5a3a;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  header h1::before {
    content: '';
    display: inline-block;
    width: 1.8rem;
    height: 1.8rem;
    /* The silhouette runs to the very edge of the PNG, so 'contain' would
       show it touching the icon border. Shrink the image to ~72% of the
       container so the matching teal background forms a visible frame
       around the figure on all four sides. */
    background-color: #356b66;
    background-image: url('/icon.png');
    background-size: 72%;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: 0.3rem;
    flex-shrink: 0;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    margin-left: auto;
  }
  /* Active region sits next to the title, in a small bordered chip. */
  .region-badge {
    padding: 0.15rem 0.55rem;
    border: 1px solid #c7d0c7;
    background: #f5f8f5;
    border-radius: 0.35rem;
    font-size: 0.78rem;
    color: #3a5a3a;
    line-height: 1.2;
  }
  /* Floating "+" pin button — desktop only. On touch devices the
     long-press gesture takes its place, so we hide it via the
     coarse-pointer media query to avoid clutter on phones. */
  .new-pin-fab {
    position: fixed;
    bottom: 1.25rem;
    right: 1.25rem;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    border: 0;
    background: #3a5a3a;
    color: white;
    font-size: 2rem;
    line-height: 1;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    cursor: pointer;
    z-index: 600;
    display: none;
  }
  .new-pin-fab:active:not(:disabled) { background: #2a4a2a; }
  .new-pin-fab:disabled {
    background: #b4c4b4;
    cursor: not-allowed;
    opacity: 0.7;
  }
  @media (pointer: fine) {
    .new-pin-fab { display: inline-flex; align-items: center; justify-content: center; }
  }
  .hint {
    color: #6b7a6b;
  }
  .link {
    background: transparent;
    color: #3a5a3a;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    font-size: 0.85rem;
  }
  .ripe-link {
    color: #d57100;
    font-weight: 600;
  }

  main.loading {
    padding: 2rem;
    color: #6b7a6b;
  }
  .filterbar {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: #f5f8f5;
    border-bottom: 1px solid #e1e8e1;
    font-size: 0.85rem;
    color: #4a554a;
  }
  .filterbar label {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .filterbar select {
    padding: 0.25rem 0.5rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    max-width: 16rem;
  }
  /* Pushes the address search to the far right of the filter bar.
     With flex-wrap on, when space gets tight the search wraps to a
     new row left-aligned, which is fine — better than crowding the
     species/show controls. */
  .filterbar-spacer { flex: 1 1 auto; }

  /* Desktop: the controls wrapper is a no-op — children participate
     in the .filterbar flexbox as if the wrapper weren't there. The
     mobile toggle button is hidden. The mobile open/closed state
     has no effect at this width. */
  .filterbar-controls { display: contents; }
  .filterbar-mobile-toggle { display: none; }

  /* Layers panel — same shape as the species filter dropdown
     so the two read as a pair. Authed users only. */
  .layers-filter { position: relative; }
  .layers-toggle {
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    color: #1f2a1f;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .layers-toggle .caret {
    color: #6b7a6b;
    font-size: 0.7rem;
  }
  .layers-panel {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    z-index: 1100;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    padding: 0.4rem;
    min-width: 14rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .layer-row {
    display: grid;
    grid-template-columns: 1.1rem 4rem 1fr;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.35rem;
    border-radius: 0.2rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .layer-row:hover { background: #f5f8f5; }
  .layer-row input { width: 0.95rem; height: 0.95rem; margin: 0; }
  .layer-name { color: #1f2a1f; font-weight: 500; }
  .layer-hint { color: #8a948a; font-size: 0.75rem; }

  /* Multi-select species filter */
  .species-filter {
    position: relative;
  }
  .species-toggle {
    padding: 0.3rem 0.7rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    color: #1f2a1f;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .caret {
    color: #6b7a6b;
    font-size: 0.7rem;
  }
  .species-panel {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    /* Above Leaflet's zoom controls (z-index ~1000). */
    z-index: 1100;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    /* Sized to fit the longest species/group name without dead
       horizontal space. Names beyond this clip with ellipsis. */
    width: 14rem;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
  }
  .species-panel-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem;
    border-bottom: 1px solid #ebefeb;
  }
  .species-panel-actions button {
    padding: 0.3rem 0.6rem;
    font-size: 0.8rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
    background: white;
    cursor: pointer;
  }
  /* Category checkboxes — replaced the prior tab strip. Each category
     toggles independently; the species list below reflects the union. */
  .species-cats {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem 1rem;
    padding: 0.4rem 0.55rem;
    border-bottom: 1px solid #ebefeb;
  }
  .cat-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: #1f2a1f;
    cursor: pointer;
  }
  .cat-toggle .count {
    color: #8a948a;
    font-size: 0.72rem;
  }
  .cat-toggle input { margin: 0; }
  .species-panel ul {
    list-style: none;
    margin: 0;
    padding: 0.15rem 0;
    overflow-y: auto;
  }
  .species-panel li {
    padding: 0 0.5rem;
  }
  .species-panel li.group-header {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.5rem 0.1rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: #3a5a3a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .species-panel li.group-header .legend-shape {
    flex-shrink: 0;
    margin-right: 0;
  }
  .species-panel li.group-header:first-child {
    padding-top: 0.1rem;
  }
  .species-panel li.indented {
    padding-left: 1.1rem;
  }
  .species-panel label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    line-height: 1.2;
    cursor: pointer;
    padding: 0.1rem 0.15rem;
    border-radius: 0.2rem;
    min-width: 0;
  }
  .species-panel label:hover {
    background: #f5f8f5;
  }
  /* The species name is the only flex child allowed to shrink and
     truncate. The count is fixed-width on the right; without
     flex-shrink:0 a long name (e.g. 'Serviceberry (unspecified)')
     pushed the count off the right edge of the panel. */
  .species-panel .sp-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .species-panel .count {
    flex-shrink: 0;
    color: #8a948a;
    margin-left: auto;
    font-size: 0.75rem;
  }
  .species-panel input[type='checkbox'] {
    margin: 0;
    width: 0.85rem;
    height: 0.85rem;
  }
  .cat-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #6b7a6b;
    flex: 0 0 auto;
  }
  .cat-dot.fruit { background: #c14a3a; }
  .cat-dot.nut { background: #7a5230; }
  .cat-dot.mushroom { background: #8a4ea0; }
  .cat-dot.other { background: #6ba040; }

  /* Pin detail side panel */
  .pin-panel {
    position: fixed;
    top: 100px; /* below header (56) + filter bar (~44) */
    right: 0;
    bottom: 0;
    width: min(28rem, 100%);
    background: white;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
    z-index: 700;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  @media (max-width: 640px) {
    .pin-panel {
      top: auto;
      height: 70vh;
    }
    /* Phone layout: a single visible row of [Filters] [search],
       with all the actual filter controls hidden behind the
       Filters toggle. When opened, they expand into a stacked
       column below the always-visible row. */
    .filterbar {
      flex-wrap: wrap;
      gap: 0.4rem;
      padding: 0.4rem 0.6rem;
      font-size: 0.85rem;
    }
    .filterbar-mobile-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.3rem 0.7rem;
      background: white;
      border: 1px solid #c7d0c7;
      border-radius: 0.3rem;
      color: #1f2a1f;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .filterbar-controls {
      display: none;
      flex-basis: 100%;
      flex-direction: column;
      gap: 0.5rem;
      padding-top: 0.4rem;
      border-top: 1px solid #e1e8e1;
      margin-top: 0.4rem;
    }
    .filterbar-controls.open { display: flex; }
    .filterbar-controls label {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }
    .filterbar-controls select {
      flex: 1;
      max-width: none;
      font-size: 0.85rem;
    }
    /* Spacer is unnecessary on phones — wrap behavior places
       AddressSearch right after the toggle naturally. */
    .filterbar-spacer { display: none; }
    .species-toggle { font-size: 0.85rem; padding: 0.25rem 0.55rem; }
    /* Tighter, smaller legend on mobile so it stops dominating the map. */
    .legend {
      bottom: 0.5rem;
      left: 0.5rem;
      padding: 0.35rem 0.55rem;
      font-size: 0.72rem;
      max-width: 9.5rem;
    }
    .legend ul { gap: 0.18rem; }
    .legend .dot { width: 0.6rem; height: 0.6rem; margin-right: 0.3rem; }
    .legend .ring1, .legend .ring2 {
      width: 0.7rem; height: 0.7rem; margin-right: 0.3rem;
    }
  }
  .panel-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0.5rem 1rem;
    background: #fafcf6;
    border-bottom: 1px solid #e1e8e1;
  }
  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    color: #3a5a3a;
  }
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .panel-actions .link {
    font-size: 1.05rem;
    text-decoration: none;
    color: #3a5a3a;
    padding: 0.2rem 0.4rem;
  }
  .panel-actions .close {
    background: transparent;
    border: 0;
    font-size: 1.5rem;
    color: #6b7a6b;
    cursor: pointer;
    line-height: 1;
    padding: 0 0.25rem;
  }
  .pin-panel :global(.content) {
    flex: 1;
    overflow-y: auto;
  }

  /* Legend */
  .legend {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 600;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: #1f2a1f;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    max-width: 14rem;
  }
  .legend-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .legend-toggle {
    background: transparent;
    border: 0;
    font-size: 1rem;
    cursor: pointer;
    color: #6b7a6b;
    padding: 0 0.25rem;
    line-height: 1;
  }
  .legend ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    /* 20 groups can fill the screen — cap and scroll. */
    max-height: 50vh;
    overflow-y: auto;
  }
  .legend .dot {
    display: inline-block;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    margin-right: 0.4rem;
    vertical-align: middle;
  }
  .legend .dot.faded { opacity: 0.4; }
  /* Shape glyphs reused by both the status legend (status section) and
     the species panel's group headers. Inline style sets the actual
     fill color from the group palette. */
  .legend-shape {
    display: inline-block;
    width: 0.8rem;
    height: 0.8rem;
    margin-right: 0.4rem;
    vertical-align: middle;
    background: #1f2a1f;
    /* Match the dark stroke + thin halo on the actual map markers
       (Map.svelte's shapeHtml) so the swatches read as the same
       symbol. Without this border the panel showed flat fills while
       the map showed bordered shapes — confused several users. */
    border: 1.4px solid #1f2a1f;
    box-sizing: border-box;
  }
  .legend-shape.circle { border-radius: 50%; }
  .legend-shape.square { border-radius: 1px; }
  /* Triangle is a CSS-border trick (no fill, the bottom-border IS
     the shape), so it can't carry a real outer border. Add a
     filter-based dark outline to fake it. */
  .legend-shape.triangle {
    width: 0; height: 0;
    background: transparent;
    border-left: 0.45rem solid transparent;
    border-right: 0.45rem solid transparent;
    border-bottom: 0.78rem solid #1f2a1f;
    border-top: 0;
    filter: drop-shadow(0 0 0.3px #1f2a1f) drop-shadow(0 0 0.3px #1f2a1f);
  }
  .legend-shape.diamond {
    transform: rotate(45deg);
    width: 0.6rem;
    height: 0.6rem;
    margin: 0 0.5rem 0 0.1rem;
  }
  .legend .ring1, .legend .ring2 {
    display: inline-block;
    width: 0.95rem; height: 0.95rem;
    margin-right: 0.4rem;
    vertical-align: middle;
    background: #c14a3a;
    border-radius: 50%;
    border: 1.5px solid white;
  }
  /* Ripe: bold solid double-ring (matches the map's strict-ripe pin). */
  .legend .ring1 {
    box-shadow:
      0 0 0 2.2px #d57100,
      0 0 0 3.4px white,
      0 0 0 4.4px rgba(213, 113, 0, 0.65);
  }
  /* Possibly ripe: a single faint dashed halo (matches the map). */
  .legend .ring2 {
    outline: 1.5px dashed #d57100;
    outline-offset: 1.5px;
  }
  .legend-show {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 600;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    color: #3a5a3a;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }
</style>
