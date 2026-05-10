<script lang="ts">
  // Calibration viewer — review per-(species, climate-zone) harvest windows
  // across data sources (current AI-propagated DB content vs Layer 2 regional
  // guides vs eventually Layer 1 NPN empirical). Helps spot gaps,
  // disagreements, and provenance per cell.
  //
  // Two visual layers per zone row:
  //   - gray bar: current species_fruiting_windows DB content (AI-derived)
  //   - orange bar: Layer 2 regional guide bracket
  //   - (Layer 1 peak markers will land here when NPN ingestion runs)
  //
  // Keyboard: ← → arrows step through species. / focuses search.

  import { onMount } from 'svelte';
  import { goto } from '$lib/utils/nav';
  import { supabase } from '$lib/supabase';
  import { activeRegion } from '$lib/stores/activeRegion';
  import regionalWindowsJson from '$lib/data/regional-windows.json';

  type Stage =
    | 'flowering' | 'green' | 'ripening' | 'ripe' | 'past' | 'bare' | 'unknown'
    | 'sap_run' | 'shoot' | 'leaf' | 'flower_harvest' | 'root_dig'
    | 'mushroom_flush' | 'bark_strip';

  interface SpeciesRow {
    id: string;
    common_name: string;
    scientific_name: string;
    forage_parts: string[];
  }

  type ReviewStatus = 'unreviewed' | 'confirmed' | 'needs_work';

  interface SpeciesSummary {
    n_distinct_sources: number;
    n_rows: number;
    review_status: ReviewStatus;
  }

  /** Pick the stage we expect calibration data to live under, based on
   *  the species' forage_parts. Mirrors the priority logic in the
   *  pin_is_edible_now SQL function (mig 16). Multi-part species pick
   *  the highest-priority part: mushroom > fruit/nut > shoot > leaf >
   *  root > flower > bark > sap. */
  function primaryStageFor(parts: string[] | undefined | null): Stage {
    if (!parts || parts.length === 0) return 'ripe';
    if (parts.includes('mushroom')) return 'mushroom_flush';
    if (parts.includes('fruit') || parts.includes('nut') || parts.includes('seed')) return 'ripe';
    if (parts.includes('shoot')) return 'shoot';
    if (parts.includes('leaf') || parts.includes('bulb')) return 'leaf';
    if (parts.includes('root')) return 'root_dig';
    if (parts.includes('flower')) return 'flower_harvest';
    if (parts.includes('bark')) return 'bark_strip';
    if (parts.includes('sap')) return 'sap_run';
    return 'ripe';
  }

  function stageLabel(s: Stage): string {
    switch (s) {
      case 'ripe':           return 'ripe fruit / nut';
      case 'mushroom_flush': return 'mushroom flush';
      case 'sap_run':        return 'sap flow';
      case 'shoot':          return 'spring shoots';
      case 'leaf':           return 'spring greens';
      case 'root_dig':       return 'root harvest';
      case 'flower_harvest': return 'flower harvest';
      case 'bark_strip':     return 'bark harvest';
      default:               return s;
    }
  }

  interface ZoneRow {
    id: string;
    code: string;
    name: string;
  }

  interface Evidence {
    source: string;
    url: string;
    consulted_at: string;
    summary: string;
    supports?: { start_doy?: number; end_doy?: number; peak_doy?: number };
  }

  interface DBWindow {
    id: string;
    species_id: string;
    climate_zone_id: string;
    stage: Stage;
    start_doy: number | null;
    end_doy: number | null;
    peak_doy: number | null;
    confidence: string | null;
    notes: string | null;
    evidence: Evidence[];
  }

  const CONFIDENCE_VALUES = [
    'expert_verified',
    'cited_thin',
    'regional_guide',
    'empirical_npn',
    'empirical_inat',
    'empirical_community',
    'curated',
    'frost_offset'
  ] as const;

  function sourceLinks(sci: string): { name: string; url: string }[] {
    const enc = encodeURIComponent(sci);
    const wikiPath = sci.replace(/ /g, '_');
    const parts = sci.toLowerCase().split(' ');
    const genus = parts[0] ?? '';
    const speciesName = parts.slice(1).join(' ');
    return [
      { name: 'Wikipedia',     url: `https://en.wikipedia.org/wiki/${wikiPath}` },
      { name: 'USDA NRCS',     url: `https://plants.sc.egov.usda.gov/home/searchResult?text=${enc}` },
      { name: 'iNaturalist',   url: `https://www.inaturalist.org/taxa/search?q=${enc}` },
      { name: 'GoBotany (NE)', url: `https://gobotany.nativeplanttrust.org/species/${genus}/${speciesName}/` },
      { name: 'USA-NPN',       url: `https://data.usanpn.org/observations/search?species_search=${enc}` },
      { name: 'Google search', url: `https://www.google.com/search?q=${enc}+harvest+season+phenology` }
    ];
  }

  interface JsonWindow {
    ripe?: { start_doy: number; end_doy: number; notes?: string };
    flowering?: { start_doy: number; end_doy: number; notes?: string };
    notes?: string;
  }

  interface JsonRegion {
    zone_codes: string[];
    lat: number;
    lng: number;
    source: string;
    source_url: string;
    license_note: string;
    windows: Record<string, JsonWindow>;
  }

  $: isAdmin = $activeRegion?.role === 'admin';

  let species: SpeciesRow[] = [];
  let zones: ZoneRow[] = [];
  let dbWindows: DBWindow[] = [];
  let loaded = false;
  let errorMsg = '';

  // Currently-selected species (id)
  let currentSpeciesId: string | null = null;
  let searchTerm = '';
  let searchInput: HTMLInputElement;

  /** Pin counts per zone for the current species — populated by RPC
   *  whenever currentSpeciesId changes. Zones in this map but not in
   *  the calibration data appear as empty rows so the user can see
   *  where pins exist without windows. */
  let pinsByZoneId: Record<string, number> = {};

  /** Per-species source-count + review-status, loaded once on mount.
   *  Reloaded lazily after a save / review-status change. */
  let speciesSummaryById: Record<string, SpeciesSummary> = {};
  /** Saving state for the review-status buttons. */
  let reviewBusy = false;
  /** Free-text notes the admin types about this species (what's wrong,
   *  what to revisit, etc.). Loaded from species.review_notes when the
   *  species changes, saved with a debounce on edit. */
  let reviewNotesText = '';
  let reviewNotesTimer: ReturnType<typeof setTimeout> | null = null;

  /** Which zone-row's evidence/notes panel is currently expanded. The
   *  paperclip / note pills are click-to-toggle; only one open at a
   *  time keeps the timeline scannable. */
  let expandedZoneId: string | null = null;

  // ---- Edit state ----
  let editMode = false;
  /** Zone id of the row currently being edited, or null. */
  let editingZoneId: string | null = null;
  let formStartDoy: number | null = null;
  let formEndDoy: number | null = null;
  let formPeakDoy: number | null = null;
  let formConfidence: string = 'expert_verified';
  let formNotes: string = '';
  let formEvidence: Evidence[] = [];
  let saving = false;
  let saveError = '';

  // New-evidence form state
  let newEvSource = '';
  let newEvUrl = '';
  let newEvSummary = '';
  let newEvSupportsStart: number | null = null;
  let newEvSupportsEnd: number | null = null;
  let newEvSupportsPeak: number | null = null;

  const regionalData = regionalWindowsJson as { regions: Record<string, JsonRegion> };

  /** Map JSON region name → record. Sorted by coldest min zone first
   *  (matches the per-zone order on screen). */
  $: regionsByName = regionalData.regions;

  async function loadPinZones(speciesId: string | null) {
    if (!speciesId) { pinsByZoneId = {}; return; }
    const { data, error } = await supabase.rpc(
      'species_zone_pins' as never,
      { p_species_id: speciesId } as never
    );
    // Stale-response guard: if the user moved on to another species
    // while this RPC was in flight, discard the result instead of
    // letting it overwrite the newer species's pin counts.
    if (currentSpeciesId !== speciesId) return;
    if (error) {
      console.warn('[calibration] species_zone_pins error', error);
      pinsByZoneId = {};
      return;
    }
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Array<{ zone_id: string; n_pins: number }>) {
      out[r.zone_id] = r.n_pins;
    }
    pinsByZoneId = out;
  }

  async function loadSpeciesSummaries() {
    const { data, error } = await supabase.rpc(
      'species_source_summary_all' as never,
      {} as never
    );
    if (error) {
      console.warn('[calibration] species_source_summary_all error', error);
      return;
    }
    const out: Record<string, SpeciesSummary> = {};
    for (const r of (data ?? []) as Array<{
      species_id: string;
      n_distinct_sources: number;
      n_rows: number;
      review_status: ReviewStatus;
    }>) {
      out[r.species_id] = {
        n_distinct_sources: r.n_distinct_sources,
        n_rows: r.n_rows,
        review_status: r.review_status
      };
    }
    speciesSummaryById = out;
  }

  async function setReviewStatus(status: ReviewStatus) {
    if (!currentSpeciesId || reviewBusy) return;
    reviewBusy = true;
    try {
      const { error } = await supabase
        .from('species')
        .update({
          review_status: status,
          reviewed_at: status === 'unreviewed' ? null : new Date().toISOString()
        } as never)
        .eq('id', currentSpeciesId);
      if (error) throw error;
      // Optimistic local update
      speciesSummaryById = {
        ...speciesSummaryById,
        [currentSpeciesId]: {
          ...(speciesSummaryById[currentSpeciesId] ?? { n_distinct_sources: 0, n_rows: 0, review_status: 'unreviewed' }),
          review_status: status
        }
      };
    } catch (err) {
      console.warn('[calibration] setReviewStatus error', err);
    } finally {
      reviewBusy = false;
    }
  }

  /** Load the species' review notes when the current species changes.
   *  Cheap one-row select on the species table. */
  async function loadReviewNotes(speciesId: string | null) {
    if (!speciesId) { reviewNotesText = ''; return; }
    const { data, error } = await supabase
      .from('species')
      .select('review_notes' as never)
      .eq('id', speciesId)
      .single();
    if (error) {
      console.warn('[calibration] loadReviewNotes error', error);
      reviewNotesText = '';
      return;
    }
    reviewNotesText = ((data as unknown as { review_notes: string | null })?.review_notes) ?? '';
  }

  async function saveReviewNotes(text: string) {
    if (!currentSpeciesId) return;
    const { error } = await supabase
      .from('species')
      .update({ review_notes: text || null } as never)
      .eq('id', currentSpeciesId);
    if (error) console.warn('[calibration] saveReviewNotes error', error);
  }

  function onReviewNotesInput() {
    if (reviewNotesTimer) clearTimeout(reviewNotesTimer);
    const captured = reviewNotesText;
    reviewNotesTimer = setTimeout(() => {
      void saveReviewNotes(captured);
    }, 800);
  }

  // Reload pin distribution + review notes when the species changes.
  // Clear pinsByZoneId synchronously so a slow RPC response from the
  // previous species can't briefly leak its values into the new
  // species's view (Amur maple's 6k pins ≠ avocado's pins).
  let lastLoadedSpecies: string | null = null;
  $: if (currentSpeciesId !== lastLoadedSpecies) {
    lastLoadedSpecies = currentSpeciesId;
    pinsByZoneId = {};
    expandedZoneId = null;
    if (reviewNotesTimer) { clearTimeout(reviewNotesTimer); reviewNotesTimer = null; }
    void loadPinZones(currentSpeciesId);
    void loadReviewNotes(currentSpeciesId);
  }

  async function loadWindows() {
    // Supabase REST silently caps responses at 1000 rows. The
    // species_fruiting_windows table has grown past that, so we
    // paginate explicitly via .range() to fetch all rows. Each page
    // is 1000 rows; loop until we get less than a full page.
    const PAGE = 1000;
    let all: DBWindow[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('species_fruiting_windows')
        .select(
          'id, species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence' as never
        )
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as unknown as DBWindow[];
      all = all.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
    }
    dbWindows = all.map((w) => ({
      ...w,
      evidence: (w.evidence ?? []) as Evidence[]
    }));
  }

  onMount(async () => {
    try {
      const [speciesRes, zonesRes] = await Promise.all([
        supabase
          .from('species')
          .select('id, common_name, scientific_name, forage_parts')
          .eq('is_forageable', true)
          .order('common_name'),
        supabase.from('climate_zones').select('id, code, name').order('code')
      ]);
      if (speciesRes.error) throw speciesRes.error;
      if (zonesRes.error) throw zonesRes.error;
      species = (speciesRes.data ?? []) as SpeciesRow[];
      zones = (zonesRes.data ?? []) as ZoneRow[];

      await loadWindows();
      await loadSpeciesSummaries();

      const speciesWithData = new Set(dbWindows.map((w) => w.species_id));
      currentSpeciesId =
        species.find((s) => speciesWithData.has(s.id))?.id ?? species[0]?.id ?? null;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loaded = true;
    }
  });

  // ---- Edit handlers ----

  function startEdit(zoneId: string) {
    editingZoneId = zoneId;
    saveError = '';
    const ripe = dbBySpeciesZone.get(zoneId)?.get(primaryStage);
    if (ripe) {
      formStartDoy = ripe.start_doy;
      formEndDoy = ripe.end_doy;
      formPeakDoy = ripe.peak_doy;
      formConfidence = ripe.confidence ?? 'expert_verified';
      formNotes = ripe.notes ?? '';
      formEvidence = (ripe.evidence ?? []).slice();
    } else {
      formStartDoy = null;
      formEndDoy = null;
      formPeakDoy = null;
      formConfidence = 'expert_verified';
      formNotes = '';
      formEvidence = [];
    }
    newEvSource = '';
    newEvUrl = '';
    newEvSummary = '';
    newEvSupportsStart = null;
    newEvSupportsEnd = null;
    newEvSupportsPeak = null;
  }

  function cancelEdit() {
    editingZoneId = null;
    saveError = '';
  }

  async function saveCell() {
    if (!currentSpeciesId || !editingZoneId || saving) return;
    saving = true;
    saveError = '';
    try {
      const ripe = dbBySpeciesZone.get(editingZoneId)?.get(primaryStage);
      const payload = {
        species_id: currentSpeciesId,
        climate_zone_id: editingZoneId,
        stage: primaryStage,
        start_doy: formStartDoy,
        end_doy: formEndDoy,
        peak_doy: formPeakDoy,
        confidence: formConfidence,
        notes: formNotes.trim() || null,
        evidence: formEvidence
      } as never;
      let error;
      if (ripe?.id) {
        ({ error } = await supabase
          .from('species_fruiting_windows')
          .update(payload)
          .eq('id', ripe.id));
      } else {
        ({ error } = await supabase.from('species_fruiting_windows').insert(payload));
      }
      if (error) throw error;
      await loadWindows();
      await loadSpeciesSummaries();
      cancelEdit();
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Save failed.';
    } finally {
      saving = false;
    }
  }

  async function deleteCell() {
    if (!editingZoneId || saving) return;
    const ripe = dbBySpeciesZone.get(editingZoneId)?.get(primaryStage);
    if (!ripe?.id) {
      cancelEdit();
      return;
    }
    if (!confirm('Delete this row? This removes the harvest window for this species + zone.')) return;
    saving = true;
    saveError = '';
    try {
      const { error } = await supabase
        .from('species_fruiting_windows')
        .delete()
        .eq('id', ripe.id);
      if (error) throw error;
      await loadWindows();
      await loadSpeciesSummaries();
      cancelEdit();
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Delete failed.';
    } finally {
      saving = false;
    }
  }

  function addEvidence() {
    if (!newEvSource.trim() || !newEvSummary.trim()) return;
    const supports =
      newEvSupportsStart != null || newEvSupportsEnd != null || newEvSupportsPeak != null
        ? {
            ...(newEvSupportsStart != null ? { start_doy: newEvSupportsStart } : {}),
            ...(newEvSupportsEnd != null ? { end_doy: newEvSupportsEnd } : {}),
            ...(newEvSupportsPeak != null ? { peak_doy: newEvSupportsPeak } : {})
          }
        : undefined;
    formEvidence = [
      ...formEvidence,
      {
        source: newEvSource.trim(),
        url: newEvUrl.trim(),
        consulted_at: new Date().toISOString(),
        summary: newEvSummary.trim(),
        ...(supports ? { supports } : {})
      }
    ];
    newEvSource = '';
    newEvUrl = '';
    newEvSummary = '';
    newEvSupportsStart = null;
    newEvSupportsEnd = null;
    newEvSupportsPeak = null;
  }

  function removeEvidence(idx: number) {
    formEvidence = formEvidence.filter((_, i) => i !== idx);
  }

  function applyEvidenceToForm(ev: Evidence) {
    if (ev.supports?.start_doy != null) formStartDoy = ev.supports.start_doy;
    if (ev.supports?.end_doy != null) formEndDoy = ev.supports.end_doy;
    if (ev.supports?.peak_doy != null) formPeakDoy = ev.supports.peak_doy;
  }

  function shortDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  }

  // Filtered species list for the search box.
  $: filteredSpecies = !searchTerm
    ? species
    : species.filter((s) => {
        const t = searchTerm.toLowerCase();
        return (
          s.common_name?.toLowerCase().includes(t) ||
          s.scientific_name?.toLowerCase().includes(t)
        );
      });

  $: currentSpecies = species.find((s) => s.id === currentSpeciesId) ?? null;
  /** Stages that have at least one DB row for the current species.
   *  Multi-stage species (basswood: leaf + flower_harvest; elderberry:
   *  ripe + flower_harvest) get a stage selector so each stage's
   *  trajectory + evidence + smoothing analysis can be viewed
   *  separately. */
  $: stagesWithData = (() => {
    if (!currentSpeciesId) return [] as Stage[];
    const set = new Set<Stage>();
    for (const w of dbWindows) {
      if (w.species_id === currentSpeciesId) set.add(w.stage);
    }
    const order: Stage[] = [
      'ripe', 'ripening', 'green', 'flowering', 'flower_harvest',
      'shoot', 'leaf', 'sap_run', 'mushroom_flush', 'root_dig',
      'bark_strip', 'past', 'bare', 'unknown'
    ];
    return order.filter((s) => set.has(s));
  })();

  /** User-selected stage override; resets to null when species
   *  changes so each species starts at its primaryStageFor default. */
  let selectedStage: Stage | null = null;
  let lastSpeciesForStageReset: string | null = null;
  $: if (currentSpeciesId !== lastSpeciesForStageReset) {
    lastSpeciesForStageReset = currentSpeciesId;
    selectedStage = null;
  }

  $: primaryStage = (() => {
    const def = primaryStageFor(currentSpecies?.forage_parts);
    if (selectedStage && stagesWithData.includes(selectedStage)) return selectedStage;
    // If the heuristic-default stage has no data but other stages do,
    // fall through to the first stage with data so the user always
    // sees something on first load.
    if (stagesWithData.length > 0 && !stagesWithData.includes(def)) {
      return stagesWithData[0];
    }
    return def;
  })();

  /** Smoothing analysis for the current species + primary stage —
   *  used to render the across-zone trajectory chart and the status
   *  badge in the species head. Computed live from the loaded DB
   *  rows, not historically; reflects the current state regardless
   *  of when the smoothing script last ran. */
  $: smoothingAnalysis = (() => {
    if (!currentSpecies) return null;
    const direction = directionFor(currentSpecies.scientific_name, primaryStage);
    // Collect rows for this (species, primary stage) keyed by zone numeric.
    const points: {
      zone_id: string;
      zone_code: string;
      zoneNum: number;
      start_doy: number;
      end_doy: number;
      peak_doy: number | null;
      isAnchor: boolean;
    }[] = [];
    for (const z of sortedZones) {
      const w = dbBySpeciesZone.get(z.id)?.get(primaryStage);
      if (!w || w.start_doy == null || w.end_doy == null) continue;
      points.push({
        zone_id: z.id,
        zone_code: z.code,
        zoneNum: zoneSortKey(z.code),
        start_doy: w.start_doy,
        end_doy: w.end_doy,
        peak_doy: w.peak_doy,
        isAnchor: isAnchorRow(w)
      });
    }
    points.sort((a, b) => a.zoneNum - b.zoneNum);
    const anchors = points.filter((p) => p.isAnchor);
    const soft = points.filter((p) => !p.isAnchor);
    let status: string;
    if (direction === 0) {
      status = `exempt — ${stageLabel(primaryStage)} has no zone signal`;
    } else if (points.length < 3) {
      status = `too few zones (${points.length}) — smoothing skipped`;
    } else if (anchors.length === 0) {
      status = `no anchor zones (no regional or iNat evidence) — smoothing skipped`;
    } else if (soft.length === 0) {
      status = `${anchors.length} anchor zones, no interpolation needed`;
    } else {
      status = `${anchors.length} anchor zones · ${soft.length} interpolated`;
    }
    return { direction, points, anchors, soft, status };
  })();

  /** Climate-zone code natural sort: 3a < 3b < 4a < … < 11b. */
  function zoneSortKey(code: string): number {
    const m = code.match(/^(\d+)([ab]?)$/);
    if (!m) return 99;
    const num = parseInt(m[1], 10);
    const sub = m[2] === 'b' ? 0.5 : 0;
    return num + sub;
  }

  $: sortedZones = [...zones].sort((a, b) => zoneSortKey(a.code) - zoneSortKey(b.code));

  // Cross-zone smoothing status. Same heuristic as the smoothing
  // script — heat-driven default, frost-driven override list, and
  // some stages have no monotonic signal at all.
  // Frost-driven ripe — must mirror the smoothing/enforce-monotonic
  // scripts. Hardwood mast nuts (timing tracks first frost) + frost-
  // tinted late fruits (persimmon, cranberry, beech).
  // Castanea pumila (chinkapin) and Corylus (hazelnuts) REMOVED:
  // both are heat-driven (cited Aug-Sep harvest with no first-frost
  // requirement), now handled by species-complex-unify.
  const FROST_DRIVEN_RIPE = new Set([
    'Fagus grandifolia',
    // Diospyros virginiana REMOVED: iNat (N=909+ in zone 7a) shows
    // ripe peak ~Sep 27, 30-60d earlier than frost-driven model.
    // Vaccinium macrocarpon REMOVED: heat-driven (frost is flavor folklore).
    'Castanea dentata', 'Castanea mollissima', 'Castanea sativa',
    'Castanea sp.',
    'Quercus alba', 'Quercus macrocarpa',
    'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
    'Juglans nigra', 'Juglans cinerea', 'Juglans regia'
  ]);
  const STAGE_DIRECTION: Record<string, -1 | 0 | 1> = {
    ripe: -1, ripening: -1, green: -1,
    flowering: -1, flower_harvest: -1,
    shoot: -1, leaf: -1, sap_run: -1,
    past: 0, root_dig: 0, mushroom_flush: 0, bark_strip: 0,
    bare: 0, unknown: 0
  };
  function directionFor(sci: string | undefined, stage: Stage): -1 | 0 | 1 {
    if (stage === 'ripe' && sci && FROST_DRIVEN_RIPE.has(sci)) return 1;
    return (STAGE_DIRECTION[stage] ?? 0) as -1 | 0 | 1;
  }
  /** iNat samples below this size aren't statistically reliable
   *  enough to anchor a zone — they stay visible as evidence but get
   *  treated as soft (interpolatable) so the smoothing analysis pulls
   *  them toward the curve. */
  const MIN_INAT_ANCHOR_OBS = 30;

  /** Fuzzy-language detection: agent-interpreted vague seasonal
   *  phrasing ("mid-to-late summer", "early fall") into hard DOY
   *  ranges. Those bounds are not real precision and shouldn't
   *  anchor a zone — they stay as evidence but rendered as soft.
   *  Mirrors the same regex used in the rederive + smooth scripts. */
  const FUZZY_LANGUAGE_RE = /\b(mid[\s-]+(?:to[\s-]+late\s+)?(?:spring|summer|fall|autumn|winter)|late\s+(?:spring|summer|fall|autumn|winter)|early\s+(?:spring|summer|fall|autumn|winter)|around\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|in\s+(?:spring|summer|fall|autumn|winter))\b/i;
  const PRECISE_DATE_RE = /\b(?:\d{1,2}\/\d{1,2}|january\s+\d{1,2}|february\s+\d{1,2}|march\s+\d{1,2}|april\s+\d{1,2}|may\s+\d{1,2}|june\s+\d{1,2}|july\s+\d{1,2}|august\s+\d{1,2}|september\s+\d{1,2}|october\s+\d{1,2}|november\s+\d{1,2}|december\s+\d{1,2}|DOY\s*\d+|first\s+frost|after\s+(?:first|hard)\s+frost)\b/i;
  function isFuzzy(ev: { summary?: string; supports?: { start_doy?: number; end_doy?: number } }): boolean {
    const s = ev.summary ?? '';
    if (!s) return false;
    if (PRECISE_DATE_RE.test(s)) return false;
    if (FUZZY_LANGUAGE_RE.test(s)) return true;
    const sd = ev.supports?.start_doy, ed = ev.supports?.end_doy;
    if (sd != null && ed != null && (ed - sd) > 45) return true;
    return false;
  }

  function isAnchorRow(w: DBWindow | undefined): boolean {
    if (!w) return false;
    const ev = w.evidence ?? [];
    const supporting = ev.filter(
      (e) => e.supports?.start_doy != null && e.supports?.end_doy != null
    );
    if (supporting.length === 0) return false;
    return supporting.some((e) => {
      const p = provenanceFor(e.source ?? '', e.summary ?? '');
      if (isFuzzy(e)) return false;
      if (p === 'regional') return true;
      if (p === 'empirical_inat') {
        const n = (e.supports as { n_obs?: number } | undefined)?.n_obs ?? 0;
        return n >= MIN_INAT_ANCHOR_OBS;
      }
      return false;
    });
  }

  /** For the current species, group DB windows by zone id, by stage. */
  $: dbBySpeciesZone = (() => {
    const out = new Map<string, Map<string, DBWindow>>();
    if (!currentSpeciesId) return out;
    for (const w of dbWindows) {
      if (w.species_id !== currentSpeciesId) continue;
      const inner = out.get(w.climate_zone_id) ?? new Map<string, DBWindow>();
      inner.set(w.stage, w);
      out.set(w.climate_zone_id, inner);
    }
    return out;
  })();

  /** For the current species, find regions in the JSON that match each zone.
   *  Returns Map<climate_zone_code, Array<{regionName, jsonRegion, jsonWindow}>>. */
  $: regionsByZoneCode = (() => {
    const out = new Map<string, Array<{ regionName: string; region: JsonRegion; window: JsonWindow }>>();
    if (!currentSpecies) return out;
    const sciName = currentSpecies.scientific_name;
    for (const [regionName, region] of Object.entries(regionsByName)) {
      const w = region.windows[sciName];
      if (!w) continue;
      for (const code of region.zone_codes) {
        const arr = out.get(code) ?? [];
        arr.push({ regionName, region, window: w });
        out.set(code, arr);
      }
    }
    return out;
  })();

  /** Zones that have ANY signal for this species:
   *   - calibration data (DB row or JSON guide), OR
   *   - pins (so the user can see WHERE coverage is missing).
   *  Zones with neither are hidden unless "Show zones with no data" is on. */
  $: zonesWithSignal = sortedZones.filter((z) => {
    const hasDb = dbBySpeciesZone.has(z.id);
    const hasJson = regionsByZoneCode.has(z.code);
    const hasPins = (pinsByZoneId[z.id] ?? 0) > 0;
    return hasDb || hasJson || hasPins;
  });

  let showEmptyZones = false;
  $: visibleZones = showEmptyZones ? sortedZones : zonesWithSignal;

  function pickSpecies(id: string) {
    currentSpeciesId = id;
    searchTerm = '';
  }

  function step(delta: number) {
    if (!currentSpeciesId) return;
    const idx = species.findIndex((s) => s.id === currentSpeciesId);
    const next = species[(idx + delta + species.length) % species.length];
    if (next) currentSpeciesId = next.id;
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') {
      step(1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      step(-1);
      e.preventDefault();
    } else if (e.key === '/') {
      e.preventDefault();
      searchInput?.focus();
    }
  }

  // --- SVG geometry ---
  // Year axis: 0 → 365 maps to xPad → xPad+plotW.
  const xPad = 28;
  const plotW = 720;
  const ROW_H = 22;
  const STAGE_H = 6;
  // Evidence bars: thin lanes stacked under the synthesized DB bar so
  // each cited source's claimed window is plottable side-by-side. With
  // up to 6 visible lanes plus a small reserve for the legacy JSON
  // sidecar overlay, the timeline grows from 56 → 80.
  const EV_LANE_H = 3;
  const EV_LANE_GAP = 1;
  const EV_LANE_PITCH = EV_LANE_H + EV_LANE_GAP; // 4
  const EV_MAX_LANES = 6;
  const TIMELINE_H = 80;
  const totalW = xPad + plotW + 16;

  // Helpers for the across-zone trajectory chart. Defined here so
  // they're typed and reusable; the template uses these instead of
  // inline arrow functions in {@const} blocks (which Svelte's parser
  // requires to be untyped, but tsc then complains about).
  const TRAJ_PAD = 28;
  const TRAJ_H = 110;
  function trajX(zn: number, minZ: number, maxZ: number): number {
    const span = Math.max(1, maxZ - minZ);
    return TRAJ_PAD + ((zn - minZ) / span) * (totalW - TRAJ_PAD - 16);
  }
  function trajY(doy: number): number {
    return 6 + ((doy - 1) / 365) * (TRAJ_H - 18);
  }

  /** Heuristic provenance classification per evidence entry. Real
   *  regional observations (someone in that zone reporting a specific
   *  DOY window) are the strongest signal. Shifted estimates (the
   *  blog-evidence-crawl agent took a generic statement like "fruit
   *  in late summer" and applied a per-zone DOY offset) are weakest —
   *  they should fill gaps where real observations don't exist, not
   *  compete with real observations.
   *
   *  Detection rules (heuristic, not perfect):
   *  - source starts with "iNaturalist" → 'empirical_inat'
   *  - summary contains "[zone-shift" or "(interpreted:" → 'shifted'
   *  - summary names a specific US state OR a zone code → 'regional'
   *  - otherwise → 'generic' */
  type Provenance = 'regional' | 'generic' | 'shifted' | 'empirical_inat';
  function provenanceFor(source: string, summary: string, rowZoneCode?: string): Provenance {
    if (source?.toLowerCase().startsWith('inaturalist')) return 'empirical_inat';
    const s = summary ?? '';
    // Strip agent metadata before checking — [zone-shift] is
    // decoration about how supports were computed, not about the
    // source's regional specificity. Eat The Weeds writing
    // "Florida, zone 9a" is regional ONLY for the 9a row.
    const beforeShiftTag = s.split(/\[zone-shift/i)[0];
    const hasShiftTag = /\[zone-shift/i.test(s);
    if (rowZoneCode) {
      // All zone codes mentioned in the source quote.
      const allZoneMatches = [...beforeShiftTag.matchAll(/\b([0-9]+[ab])\b/gi)];
      const mentionedZones = new Set(allZoneMatches.map((m) => m[1].toLowerCase()));
      if (mentionedZones.has(rowZoneCode.toLowerCase())) return 'regional';
      // Source mentions specific zones, but row's zone isn't among them.
      if (mentionedZones.size > 0) {
        return hasShiftTag ? 'shifted' : 'generic';
      }
    }
    // Fallback: state/region names without explicit zone reference.
    if (/\b(VT|ME|NH|MA|NY|PA|MN|WI|MI|OH|IL|CA|FL|TX|GA|NC|SC|VA|MD|WA|OR|CO|UT|AZ|NM|Vermont|Maine|Minnesota|Wisconsin|California|Florida|northern New England|Upper Midwest|southeastern|Pacific Northwest|Mid-Atlantic|Philadelphia|Toronto|Ottawa|Seattle|Boston|Chicago|Portland|metro)\b/i.test(beforeShiftTag)) return 'regional';
    if (hasShiftTag) return 'shifted';
    return 'generic';
  }

  /** Pull each evidence entry whose `supports` block has both
   *  start_doy and end_doy and surface them as flat objects. The SVG
   *  template can then bind without TS non-null assertions, which the
   *  Svelte compiler struggles with inside attributes.
   *
   *  iNat entries (from the iNaturalist phenology pipeline) carry
   *  extra percentile fields (min_doy, p10_doy, p90_doy, max_doy,
   *  n_obs) so the viewer can plot the full Fruiting-observation
   *  distribution as dots-flanking-line: min dot · p10 dot · line
   *  p15→p85 · p90 dot · max dot, with the median marked. */
  function supportingEvidenceFor(w: DBWindow, rowZoneCode?: string): {
    source: string;
    summary: string;
    start_doy: number;
    end_doy: number;
    peak_doy: number | null;
    provenance: Provenance;
    is_inat: boolean;
    min_doy: number | null;
    p10_doy: number | null;
    p90_doy: number | null;
    max_doy: number | null;
    n_obs: number | null;
  }[] {
    const out: ReturnType<typeof supportingEvidenceFor> = [];
    for (const ev of w.evidence ?? []) {
      const s = ev.supports as
        | (NonNullable<typeof ev.supports> & {
            min_doy?: number;
            p10_doy?: number;
            p90_doy?: number;
            max_doy?: number;
            n_obs?: number;
          })
        | undefined;
      if (!s || s.start_doy == null || s.end_doy == null) continue;
      const provenance = provenanceFor(ev.source ?? '', ev.summary ?? '', rowZoneCode);
      out.push({
        source: ev.source,
        summary: ev.summary,
        start_doy: s.start_doy,
        end_doy: s.end_doy,
        peak_doy: s.peak_doy ?? null,
        provenance,
        is_inat: provenance === 'empirical_inat',
        min_doy: s.min_doy ?? null,
        p10_doy: s.p10_doy ?? null,
        p90_doy: s.p90_doy ?? null,
        max_doy: s.max_doy ?? null,
        n_obs: s.n_obs ?? null
      });
    }
    // Render order: regional first (most authoritative), then generic,
    // then shifted estimates (faintest), then iNat at the bottom (its
    // own visual band). Shifted-estimate lanes after generic so the
    // viewer sees the strongest sources on top.
    const order: Record<Provenance, number> = {
      regional: 0, generic: 1, shifted: 2, empirical_inat: 3
    };
    out.sort((a, b) => order[a.provenance] - order[b.provenance]);
    return out;
  }

  /** Stroke style per evidence-source provenance — separate from the
   *  row-level confidence dash. Each evidence entry now drives its
   *  own visual presentation based on whether it's a real regional
   *  observation, generic source, ad-hoc shifted estimate, or iNat
   *  empirical. */
  function provenanceStyle(p: Provenance): { dash: string; opacity: number } {
    if (p === 'regional') return { dash: '', opacity: 0.9 };       // solid, full
    if (p === 'generic')  return { dash: '6,2', opacity: 0.7 };    // long dash
    if (p === 'shifted')  return { dash: '1,2', opacity: 0.4 };    // dotted, faint
    return { dash: '', opacity: 0.85 };                            // iNat handled separately
  }

  /** Distinct color for iNaturalist-source bars so the empirical
   *  observations layer is visually separable from cited foraging
   *  blogs / extension services. */
  const INAT_COLOR = '#1f6f8b';

  /** Species where iNat 'Fruiting' captures the wrong stage for
   *  foraging — hardwood mast nuts where observers tag developing
   *  nuts visible on the tree (summer), not the post-frost harvest.
   *  Mirrors the script's INAT_WRONG_STAGE list. The viewer fades
   *  iNat lanes for these species so it's visually obvious that
   *  iNat is not contributing to the synthesized DOY. */
  // Castanea pumila (chinkapin) REMOVED: iNat captures the actual
  // ripe fruit and is reliable enough to drive the empirical slope
  // fit (-2.6 d/half-zone, n=6).
  const INAT_WRONG_STAGE = new Set([
    'Fagus grandifolia',
    'Castanea dentata', 'Castanea mollissima', 'Castanea sativa',
    'Castanea sp.',
    'Quercus alba', 'Quercus macrocarpa',
    'Carya ovata', 'Carya laciniosa', 'Carya illinoinensis',
    'Juglans nigra', 'Juglans cinerea', 'Juglans regia',
    'Corylus americana', 'Corylus cornuta'
  ]);
  $: inatWrongStageForCurrent =
    !!currentSpecies && INAT_WRONG_STAGE.has(currentSpecies.scientific_name);

  /** Visual tier for a row's confidence value. Substantial rows render
   *  as solid bars; thin rows render dashed; heuristic rows (no real
   *  source — AI-seeded or frost-offset propagation) render dotted and
   *  faded so the timeline shows at a glance which zones rest on real
   *  evidence vs. propagated guesses. */
  function confidenceStyle(c: string | null | undefined): {
    dash: string;
    opacity: number;
    tier: 'substantial' | 'thin' | 'heuristic';
  } {
    if (c === 'expert_verified' || c === 'regional_guide' ||
        c === 'empirical_npn' || c === 'empirical_inat' ||
        c === 'empirical_community') {
      return { dash: '', opacity: 0.85, tier: 'substantial' };
    }
    if (c === 'cited_thin') {
      return { dash: '4,2', opacity: 0.7, tier: 'thin' };
    }
    return { dash: '1,2', opacity: 0.5, tier: 'heuristic' };
  }

  function doyX(doy: number): number {
    return xPad + (doy / 365) * plotW;
  }

  // Month tick positions: DOY for first of each month (non-leap).
  const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  /** Color per stage so the bars are distinguishable. Multi-stage
   *  species (basswood: leaf + flower_harvest; elderberry: ripe +
   *  flower_harvest) need distinct colors per stage so the viewer
   *  doesn't conflate them visually. */
  function stageColor(stage: Stage): string {
    switch (stage) {
      case 'flowering':       return '#d199e3'; // light purple — pre-fruit flowers
      case 'flower_harvest':  return '#c252a8'; // magenta — flowers as forage target
      case 'green':           return '#9bd6a3'; // light green — green fruit
      case 'ripening':        return '#e8b04a'; // amber — ripening fruit
      case 'ripe':            return '#c84545'; // red — ripe fruit/nut
      case 'past':            return '#7a7a7a'; // gray
      case 'shoot':           return '#5fa84a'; // medium green — spring shoots
      case 'leaf':            return '#3e8a58'; // dark green — spring greens / leaves
      case 'sap_run':         return '#9b7a4f'; // tan — sap
      case 'root_dig':        return '#7a5a3a'; // brown — roots
      case 'mushroom_flush':  return '#8b5a8b'; // mushroom purple
      case 'bark_strip':      return '#5a4030'; // dark brown — bark
      case 'bare':            return '#bbb';
      case 'unknown':         return '#bbb';
      default:                return '#bbb';
    }
  }

  /** Honest labels for the two `confidence` values currently in the DB.
   *  Neither is real human curation — both originate from AI-seeded
   *  `data/species/ithaca.json` (5b) plus heuristic propagation
   *  (frost-offset shifts to other zones, or literal copy to 6a). */
  function confidenceLabel(c: string | null | undefined): string {
    if (c === 'curated') return 'AI-seeded (Ithaca 5b)';
    if (c === 'frost_offset') return 'frost-shifted';
    if (c === 'expert_verified') return 'verified';
    if (c === 'cited_thin') return 'thin citation';
    if (c === 'regional_guide') return 'regional guide';
    if (c === 'empirical_npn') return 'NPN empirical';
    if (c === 'empirical_inat') return 'iNat empirical';
    if (c === 'empirical_community') return 'community sightings';
    return c ?? '';
  }
  function confidenceTitle(c: string | null | undefined): string {
    if (c === 'curated') return 'Provenance: data/species/ithaca.json — AI-generated in an earlier session, not verified against a primary source. Zone 6a values are literal copies of 5b.';
    if (c === 'frost_offset') return 'Provenance: heuristic shift of the 5b values by per-zone frost-date offset (migration #47). Inherits 5b uncertainty.';
    if (c === 'expert_verified') return 'Verified with multiple cited sources in the per-cell evidence log.';
    if (c === 'cited_thin') return 'Single citation, often weak — DOY values came from agent general knowledge with one tangential web fact attached. Treat as approximate; re-cite or revise.';
    if (c === 'regional_guide') return 'Source: a regional expert guide (CityFruit / Hidden Harvest / NFFTT / POP / UCANR).';
    if (c === 'empirical_npn') return 'Source: USA-NPN observations aggregated per zone with leading-edge offset.';
    if (c === 'empirical_inat') return 'Source: iNaturalist research-grade Fruiting-annotated observations binned by climate zone. Published DOY range is the inner-70% inset (p15-p85) of the per-zone DOY distribution; outer percentiles (min/p10/p90/max) plotted as dots flanking the line. N>=10 obs per zone. Broader species coverage than NPN but noisier annotations (Fruiting includes green/ripe/over-ripe; observers post first-fruit novelties unevenly).';
    if (c === 'empirical_community') return 'Source: community-reporting tracker (e.g. The Great Morel).';
    return '';
  }
</script>

<svelte:window on:keydown={onKey} />

<header>
  <button class="back" on:click={() => goto('/')}>← Map</button>
  <h1>Calibration viewer</h1>
  <span class="hint">{species.length} species · {zones.length} zones · ↔ to step · / to search</span>
</header>

<main>
  {#if !loaded}
    <p class="muted">Loading…</p>
  {:else if errorMsg}
    <p class="error">{errorMsg}</p>
  {:else if !isAdmin}
    <p class="muted">Admin only.</p>
  {:else}
    <!-- Species selector: search box + prev/next -->
    <div class="picker">
      <button class="step" on:click={() => step(-1)} title="Previous species (←)">‹</button>
      <input
        bind:this={searchInput}
        bind:value={searchTerm}
        placeholder={currentSpecies ? `${currentSpecies.common_name} — ${currentSpecies.scientific_name}` : 'Search species…'}
        class="search"
      />
      <button class="step" on:click={() => step(1)} title="Next species (→)">›</button>
    </div>

    {#if searchTerm && filteredSpecies.length > 0}
      <div class="dropdown">
        {#each filteredSpecies.slice(0, 30) as s (s.id)}
          <button class="dropdown-item" on:click={() => pickSpecies(s.id)}>
            <span class="dd-common">{s.common_name}</span>
            <span class="dd-sci">{s.scientific_name}</span>
          </button>
        {/each}
        {#if filteredSpecies.length > 30}
          <div class="muted small">+{filteredSpecies.length - 30} more — narrow your search</div>
        {/if}
      </div>
    {/if}

    {#if currentSpecies}
      {@const summary = speciesSummaryById[currentSpecies.id]}
      {@const sourceCount = summary?.n_distinct_sources ?? 0}
      {@const sourceTier = sourceCount === 0 ? 'none' : sourceCount === 1 ? 'thin' : sourceCount === 2 ? 'pair' : 'strong'}
      {@const reviewStatus = summary?.review_status ?? 'unreviewed'}
      <div class="species-head">
        <h2>{currentSpecies.common_name}</h2>
        <div class="sci">{currentSpecies.scientific_name}</div>
        <span class="src-count src-{sourceTier}" title={
          sourceTier === 'none' ? 'No cited sources yet — values are heuristic-shifted or AI-derived.'
          : sourceTier === 'thin' ? 'Single cited source. Goal: ≥3 independent sources.'
          : sourceTier === 'pair' ? '2 cited sources. Goal: ≥3 independent sources.'
          : `${sourceCount} cited sources — meets the ≥3 goal.`
        }>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'}</span>
        <span class="review-chip review-{reviewStatus}" title={
          reviewStatus === 'confirmed' ? 'Marked confirmed — values + sources reviewed.'
          : reviewStatus === 'needs_work' ? 'Marked needs work — flagged for revisit.'
          : 'Not yet reviewed.'
        }>{reviewStatus.replace('_', ' ')}</span>
        <div class="stage-tag" title="Forage parts: {(currentSpecies.forage_parts ?? []).join(', ') || 'none'}">
          harvest stage: <strong>{stageLabel(primaryStage)}</strong>
        </div>
        {#if stagesWithData.length > 1}
          <div class="stage-tabs" title="This species has data for multiple harvest stages — switch which one the trajectory + evidence analysis below focuses on.">
            {#each stagesWithData as s}
              <button
                class="stage-tab"
                class:active={s === primaryStage}
                on:click={() => (selectedStage = s)}
                type="button"
              >{stageLabel(s)}</button>
            {/each}
          </div>
        {/if}
        {#if smoothingAnalysis}
          <span class="smoothing-chip" title={
            smoothingAnalysis.direction === 0
              ? 'This stage has no monotonic zone signal — smoothing is not applicable. The synthesized DOYs come from per-row evidence only.'
              : smoothingAnalysis.anchors.length === 0
                ? 'No regional or iNat evidence on any zone for this species/stage — smoothing was skipped. Synthesized DOYs come from per-row evidence (generic / shifted only).'
                : `Anchor zones (${smoothingAnalysis.anchors.length}) have regional or iNat evidence — their synthesized DOYs come from that evidence directly. Soft zones (${smoothingAnalysis.soft.length}) had only generic / shifted evidence and got their DOYs interpolated from flanking anchors. Direction: ${smoothingAnalysis.direction === -1 ? 'heat-driven (warmer → earlier)' : 'frost-driven (warmer → later)'}.`
          }>
            smoothing: {smoothingAnalysis.status}
          </span>
          {#if inatWrongStageForCurrent}
            <span class="inat-ghost-chip" title="iNat 'Fruiting' annotations capture nuts visible on the tree (developing burrs/hulls in summer) — wrong stage for foragers, who collect dropped nuts after first frost. Synthesized DOYs are anchored to NOAA first-frost climatology + cited silviculture sources (USDA Forest Service Silvics, regional foraging guides). iNat lanes are still rendered (ghosted) for spread visibility but excluded from synthesis.">
              iNat ghosted (wrong stage)
            </span>
          {/if}
        {/if}
      </div>

      <div class="review-actions">
        <button
          class="rb rb-confirm"
          class:active={reviewStatus === 'confirmed'}
          on:click={() => setReviewStatus(reviewStatus === 'confirmed' ? 'unreviewed' : 'confirmed')}
          disabled={reviewBusy}
        >
          {reviewStatus === 'confirmed' ? '✓ Confirmed' : 'Mark confirmed'}
        </button>
        <button
          class="rb rb-needs"
          class:active={reviewStatus === 'needs_work'}
          on:click={() => setReviewStatus(reviewStatus === 'needs_work' ? 'unreviewed' : 'needs_work')}
          disabled={reviewBusy}
        >
          {reviewStatus === 'needs_work' ? '⚠ Needs work' : 'Mark needs work'}
        </button>
        <textarea
          class="review-notes-input"
          bind:value={reviewNotesText}
          on:input={onReviewNotesInput}
          on:blur={() => { if (reviewNotesTimer) { clearTimeout(reviewNotesTimer); reviewNotesTimer = null; } void saveReviewNotes(reviewNotesText); }}
          placeholder="Notes for follow-up: what's wrong, what to revisit, sources to chase…"
          rows="2"
        ></textarea>
      </div>

      <div class="legend">
        <span class="legend-item"><span class="swatch swatch-db"></span>Synthesized DB row (per zone)</span>
        <span class="legend-item"><span class="swatch swatch-evidence"></span>Per-source range (1 lane per cited window)</span>
        <span class="legend-item" title="iNaturalist research-grade Fruiting observations binned by climate zone. Faded outer dots = first/last single observation. Inner dots = p10/p90 (trimmed from published range). Solid line = p15-p85 published range. Hollow center dot = median. The trim discounts 'first fruit' tail outliers; no observation is shifted in time.">
          <span class="swatch swatch-inat"></span>iNat: <span class="inat-legend-glyph">·•━●━•·</span>min p10 p15-p85 p90 max
        </span>
        <span class="legend-item" title="Source provenance — drives the per-source line style.
Solid: regional observation (someone in that zone reporting specific timing — the strongest signal).
Long dashes: generic source (e.g. Wikipedia general statement) — the cited fact applies, but the per-zone DOY is approximate.
Tight dots, faded: ad-hoc shifted estimate (agent took a generic fact and applied a per-zone offset like '+28d from base 6a -> 4a'). Should fill gaps where no real observations exist; should not compete with real observations.">
          <span class="swatch-line swatch-line-solid"></span>regional ·
          <span class="swatch-line swatch-line-dashed"></span>generic ·
          <span class="swatch-line swatch-line-dotted"></span>shifted estimate
        </span>
        <span class="legend-item"><span class="swatch swatch-guide"></span>Regional guide (JSON sidecar)</span>
        <label class="toggle" title="Off: show zones that have either cal data or pins for this species. On: show every USDA zone, even ones with neither.">
          <input type="checkbox" bind:checked={showEmptyZones} />
          Show all zones (incl. no pins/data)
        </label>
        <label class="toggle toggle-edit">
          <input type="checkbox" bind:checked={editMode} on:change={() => { if (!editMode) cancelEdit(); }} />
          <strong>Edit mode</strong>
        </label>
      </div>

      {#if editMode}
        <div class="source-sidebar">
          <span class="muted small">Open in new tab to research:</span>
          {#each sourceLinks(currentSpecies.scientific_name) as link}
            <a class="source-link" href={link.url} target="_blank" rel="noopener">{link.name} ↗</a>
          {/each}
        </div>
      {/if}

      {#if visibleZones.length === 0}
        <p class="muted">No data in any zone for this species. Toggle "Show zones with no data" to see the empty matrix.</p>
      {:else}
        {#if smoothingAnalysis && smoothingAnalysis.points.length >= 2}
          <!-- Across-zone trajectory: peak DOY vs zone with start/end
               envelope. Anchor zones drawn as filled circles; soft
               (interpolated) zones as hollow circles. Lets the user see
               the cross-zone pattern at a glance and which zones drive
               the curve. -->
          {@const az = smoothingAnalysis}
          {@const minZ = az.points[0].zoneNum}
          {@const maxZ = az.points[az.points.length - 1].zoneNum}
          <div class="trajectory">
            <div class="trajectory-head">
              <strong>Across zones — {stageLabel(primaryStage)} peak DOY vs zone</strong>
              <span class="muted small">
                {az.direction === -1 ? '↘ heat-driven (warmer = earlier)' :
                 az.direction === 1 ? '↗ frost-driven (warmer = later)' :
                 'no monotonic signal'}
              </span>
            </div>
            <svg viewBox="0 0 {totalW} {TRAJ_H}" width={totalW} height={TRAJ_H} class="trajectory-svg">
              <!-- Month gridlines -->
              {#each [32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335] as doy}
                <line x1={TRAJ_PAD} x2={totalW - 16} y1={trajY(doy)} y2={trajY(doy)}
                      stroke="#eef1ee" stroke-width="0.5" />
              {/each}
              <!-- Month labels (Y axis) -->
              {#each [{d:32,l:'F'},{d:60,l:'M'},{d:91,l:'A'},{d:121,l:'M'},{d:152,l:'J'},{d:182,l:'J'},{d:213,l:'A'},{d:244,l:'S'},{d:274,l:'O'},{d:305,l:'N'}] as m}
                <text x={2} y={trajY(m.d) + 3} class="axis-label">{m.l}</text>
              {/each}
              <!-- Zone labels (X axis) -->
              {#each az.points as p}
                <text x={trajX(p.zoneNum, minZ, maxZ)} y={TRAJ_H - 2} class="axis-label" text-anchor="middle">{p.zone_code}</text>
              {/each}
              <!-- Start-end envelope band -->
              {#if az.points.length >= 2}
                {@const bandPath = az.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${trajX(p.zoneNum, minZ, maxZ)} ${trajY(p.start_doy)}`).join(' ') + ' ' + az.points.slice().reverse().map((p) => `L ${trajX(p.zoneNum, minZ, maxZ)} ${trajY(p.end_doy)}`).join(' ') + ' Z'}
                <path d={bandPath} fill={stageColor(primaryStage)} opacity="0.18" />
              {/if}
              <!-- Peak line -->
              {#if az.points.some(p => p.peak_doy != null)}
                {@const peakPts = az.points.filter(p => p.peak_doy != null)}
                <polyline points={peakPts.map(p => `${trajX(p.zoneNum, minZ, maxZ)},${trajY(p.peak_doy ?? 0)}`).join(' ')}
                          fill="none" stroke={stageColor(primaryStage)}
                          stroke-width="1.5" opacity="0.7" />
              {/if}
              <!-- Per-zone markers: filled = anchor, hollow = soft -->
              {#each az.points as p}
                {@const cx = trajX(p.zoneNum, minZ, maxZ)}
                {@const cy = trajY(p.peak_doy ?? Math.round((p.start_doy + p.end_doy) / 2))}
                {#if p.isAnchor}
                  <circle cx={cx} cy={cy} r="3.5" fill={stageColor(primaryStage)}
                          stroke="#1f2a1f" stroke-width="0.5">
                    <title>{p.zone_code} · ANCHOR (regional or iNat evidence) · DOY {p.start_doy}-{p.end_doy} peak {p.peak_doy ?? '—'}</title>
                  </circle>
                {:else}
                  <circle cx={cx} cy={cy} r="3" fill="white"
                          stroke={stageColor(primaryStage)} stroke-width="1.5"
                          stroke-dasharray="2,1">
                    <title>{p.zone_code} · soft (interpolated from anchors or generic-evidence-only) · DOY {p.start_doy}-{p.end_doy} peak {p.peak_doy ?? '—'}</title>
                  </circle>
                {/if}
              {/each}
            </svg>
            <div class="trajectory-legend">
              <span class="legend-item">
                <span class="dot dot-anchor" style="background: {stageColor(primaryStage)}"></span>
                anchor (regional / iNat)
              </span>
              <span class="legend-item">
                <span class="dot dot-soft" style="border-color: {stageColor(primaryStage)}"></span>
                soft (interpolated)
              </span>
            </div>
          </div>
        {/if}
        <div class="rows">
          {#each visibleZones as z (z.id)}
            {@const dbStages = dbBySpeciesZone.get(z.id)}
            {@const jsonRegions = regionsByZoneCode.get(z.code) ?? []}
            <div class="zone-row">
              <div class="zone-label">
                <strong>{z.code}</strong>
                <span class="zone-name muted">{z.name.replace('USDA hardiness zone ', '')}</span>
                {#if pinsByZoneId[z.id]}
                  <span class="zone-pin-count" title="Pins in this zone for this species">{pinsByZoneId[z.id].toLocaleString()} pins</span>
                {/if}
              </div>
              <svg viewBox="0 0 {totalW} {TIMELINE_H}" width={totalW} height={TIMELINE_H} class="timeline">
                <!-- Month grid -->
                {#each MONTH_STARTS as doy, i}
                  <line x1={doyX(doy)} x2={doyX(doy)} y1={0} y2={TIMELINE_H - 12}
                        stroke="#e1e8e1" stroke-width="1" />
                  <text x={doyX(doy) + 2} y={TIMELINE_H - 2} class="axis-label">{MONTH_LABELS[i]}</text>
                {/each}
                <line x1={doyX(0)} x2={doyX(365)} y1={TIMELINE_H - 12} y2={TIMELINE_H - 12}
                      stroke="#c7d0c7" stroke-width="1" />

                <!-- DB layer (synthesized window for primary stage, plus
                     any other recorded stages stacked above). Stroke
                     dash conveys confidence tier so thin-citation rows
                     visually stand apart from substantial ones. -->
                {#if dbStages}
                  {#each [...dbStages.values()] as w}
                    {#if w.start_doy != null && w.end_doy != null}
                      {@const cs = confidenceStyle(w.confidence)}
                      <rect
                        x={doyX(w.start_doy)}
                        y={6}
                        width={Math.max(2, doyX(w.end_doy) - doyX(w.start_doy))}
                        height={STAGE_H}
                        fill={stageColor(w.stage)}
                        opacity={cs.tier === 'heuristic' ? 0.32 : cs.tier === 'thin' ? 0.45 : 0.6}
                        stroke={stageColor(w.stage)}
                        stroke-width={cs.tier === 'substantial' ? 0 : 1}
                        stroke-dasharray={cs.dash}
                      >
                        <title>DB · {w.stage} · DOY {w.start_doy}–{w.end_doy}{w.confidence ? ` · ${w.confidence}` : ''}</title>
                      </rect>
                      {#if w.peak_doy != null}
                        <circle cx={doyX(w.peak_doy)} cy={6 + STAGE_H / 2} r="3" fill="#1f2a1f" opacity={cs.opacity}>
                          <title>DB peak · DOY {w.peak_doy}</title>
                        </circle>
                      {/if}
                    {/if}
                  {/each}
                {/if}

                <!-- Per-evidence range bars: each cited source's claimed
                     window for the primary stage, stacked as thin lanes
                     so spread/agreement is visible at a glance. Only
                     evidence entries with both start_doy and end_doy in
                     their `supports` block contribute a bar. -->
                {#if dbStages}
                  {@const ripe = dbStages.get(primaryStage)}
                  {#if ripe}
                    {@const cs = confidenceStyle(ripe.confidence)}
                    {@const supportingEv = supportingEvidenceFor(ripe, z.code)}
                    {#each supportingEv.slice(0, EV_MAX_LANES) as ev, i}
                      {@const y = 6 + STAGE_H + 2 + i * EV_LANE_PITCH}
                      {@const cy = y + EV_LANE_H / 2}
                      {@const stroke = ev.is_inat ? INAT_COLOR : stageColor(ripe.stage)}
                      <!-- For wrong-stage species (mast nuts), iNat is
                           shown for spread visibility but excluded from
                           synthesis. Reduced opacity makes that visually
                           obvious — the iNat lane is "ghosted". -->
                      {@const inatFade = ev.is_inat && inatWrongStageForCurrent ? 0.3 : 1}
                      {#if ev.is_inat && ev.min_doy != null && ev.max_doy != null}
                        <!-- Full distribution: min · p10 · ━ p15-p85 ━ · p90 · max
                             with median marked. Outer dots faded (outliers,
                             trimmed); inner dots solid (the percentile bracket
                             we discount, but show); line is the published
                             p15-p85 inner-70% range. -->
                        {#if ev.min_doy < ev.start_doy}
                          <circle cx={doyX(ev.min_doy)} cy={cy} r="1.6"
                                  fill={INAT_COLOR} opacity={0.35 * inatFade}>
                            <title>iNat first observation (DOY {ev.min_doy}) — earliest single Fruiting obs in this zone{inatWrongStageForCurrent ? '\n[GHOSTED — iNat excluded from synthesis: this species\'s iNat Fruiting captures developing nuts on the tree, not harvest]' : ''}</title>
                          </circle>
                        {/if}
                        {#if ev.p10_doy != null && ev.p10_doy < ev.start_doy}
                          <circle cx={doyX(ev.p10_doy)} cy={cy} r="1.6"
                                  fill={INAT_COLOR} opacity={0.55 * inatFade}>
                            <title>iNat p10 (DOY {ev.p10_doy}) — 10th percentile, trimmed from published range</title>
                          </circle>
                        {/if}
                        <line x1={doyX(ev.start_doy)} x2={doyX(ev.end_doy)}
                              y1={cy} y2={cy}
                              stroke={INAT_COLOR}
                              stroke-width={EV_LANE_H}
                              opacity={cs.opacity * inatFade}
                              stroke-dasharray={inatWrongStageForCurrent ? '2,3' : ''}
                              stroke-linecap="butt">
                          <title>iNat published range p15-p85 (DOY {ev.start_doy}-{ev.end_doy}) · N={ev.n_obs ?? '?'} obs{inatWrongStageForCurrent ? '\n[GHOSTED — iNat excluded from synthesis for this species (wrong stage: developing nuts, not harvest)]' : ''}{'\n'}{ev.summary}</title>
                        </line>
                        {#if ev.p90_doy != null && ev.p90_doy > ev.end_doy}
                          <circle cx={doyX(ev.p90_doy)} cy={cy} r="1.6"
                                  fill={INAT_COLOR} opacity={0.55 * inatFade}>
                            <title>iNat p90 (DOY {ev.p90_doy}) — 90th percentile, trimmed from published range</title>
                          </circle>
                        {/if}
                        {#if ev.max_doy > ev.end_doy}
                          <circle cx={doyX(ev.max_doy)} cy={cy} r="1.6"
                                  fill={INAT_COLOR} opacity={0.35 * inatFade}>
                            <title>iNat last observation (DOY {ev.max_doy}) — latest single Fruiting obs in this zone</title>
                          </circle>
                        {/if}
                        {#if ev.peak_doy != null}
                          <circle cx={doyX(ev.peak_doy)} cy={cy} r="2.2"
                                  fill="white" stroke={INAT_COLOR}
                                  stroke-width="1" opacity={cs.opacity * inatFade}>
                            <title>iNat median (DOY {ev.peak_doy})</title>
                          </circle>
                        {/if}
                      {:else}
                        {@const ps = provenanceStyle(ev.provenance)}
                        <line
                          x1={doyX(ev.start_doy)}
                          x2={doyX(ev.end_doy)}
                          y1={cy} y2={cy}
                          stroke={stroke}
                          stroke-width={EV_LANE_H}
                          stroke-dasharray={ps.dash}
                          opacity={ps.opacity}
                          stroke-linecap="butt"
                        >
                          <title>{ev.source} ({ev.provenance}) · DOY {ev.start_doy}–{ev.end_doy}{ev.peak_doy != null ? ` · peak ${ev.peak_doy}` : ''}{'\n'}{ev.summary}</title>
                        </line>
                        {#if ev.peak_doy != null}
                          <circle cx={doyX(ev.peak_doy)} cy={cy} r="2"
                                  fill={stroke} opacity={ps.opacity} />
                        {/if}
                      {/if}
                    {/each}
                    {#if supportingEv.length > EV_MAX_LANES}
                      <text x={xPad} y={6 + STAGE_H + 2 + EV_MAX_LANES * EV_LANE_PITCH + 8}
                            class="axis-label">+{supportingEv.length - EV_MAX_LANES} more</text>
                    {/if}
                  {/if}
                {/if}

                <!-- Layer 2: legacy JSON sidecar guide bars. Stacked
                     beneath the evidence band to keep both visible. -->
                {#each jsonRegions as r, idx}
                  {#if r.window.ripe}
                    {@const evRow = dbStages?.get(primaryStage)}
                    {@const evCount = evRow ? Math.min(EV_MAX_LANES, supportingEvidenceFor(evRow, z.code).length) : 0}
                    <rect
                      x={doyX(r.window.ripe.start_doy)}
                      y={6 + STAGE_H + 4 + evCount * EV_LANE_PITCH + idx * (STAGE_H + 2)}
                      width={Math.max(2, doyX(r.window.ripe.end_doy) - doyX(r.window.ripe.start_doy))}
                      height={STAGE_H}
                      fill="#e07b3a"
                      opacity="0.85"
                    >
                      <title>{r.regionName} · ripe · DOY {r.window.ripe.start_doy}–{r.window.ripe.end_doy} · {r.region.source}{r.window.ripe.notes ? '\n' + r.window.ripe.notes : ''}</title>
                    </rect>
                  {/if}
                {/each}
              </svg>
              <div class="row-meta">
                {#if jsonRegions.length > 0}
                  {#each jsonRegions as r}
                    <a class="src-pill" href={r.region.source_url} target="_blank" rel="noopener">
                      {r.regionName}
                    </a>
                  {/each}
                {/if}
                {#if dbStages && dbStages.size > 0}
                  {@const ripe = dbStages.get(primaryStage)}
                  {#if ripe?.confidence}
                    <span class="conf-pill conf-{ripe.confidence}" title={confidenceTitle(ripe.confidence)}>{confidenceLabel(ripe.confidence)}</span>
                  {/if}
                  {#if ripe && ripe.evidence && ripe.evidence.length > 0}
                    <button
                      class="ev-pill clickable"
                      on:click={() => (expandedZoneId = expandedZoneId === z.id ? null : z.id)}
                    >{ripe.evidence.length}📎</button>
                  {/if}
                  {#if ripe?.notes}
                    <button
                      class="note-pill clickable"
                      on:click={() => (expandedZoneId = expandedZoneId === z.id ? null : z.id)}
                    >note</button>
                  {/if}
                {/if}
                {#if editMode && editingZoneId !== z.id}
                  <button class="edit-btn" on:click={() => startEdit(z.id)}>
                    {dbStages?.has(primaryStage) ? 'Edit' : '+ Add'}
                  </button>
                {/if}
              </div>
            </div>
            {#if !editMode && expandedZoneId === z.id && dbBySpeciesZone.get(z.id)?.get(primaryStage)}
              {@const ripe = dbBySpeciesZone.get(z.id)?.get(primaryStage)}
              <div class="row-detail">
                {#if ripe?.notes}
                  <div class="detail-section">
                    <strong>Notes</strong>
                    <p class="detail-text">{ripe.notes}</p>
                  </div>
                {/if}
                {#if ripe?.evidence && ripe.evidence.length > 0}
                  <div class="detail-section">
                    <strong>Evidence ({ripe.evidence.length})</strong>
                    <ul class="evidence-list-readonly">
                      {#each ripe.evidence as ev}
                        <li>
                          <strong>{ev.source}</strong>
                          {#if ev.url}
                            <a class="ev-link" href={ev.url} target="_blank" rel="noopener">↗</a>
                          {/if}
                          <span class="muted small">· {shortDate(ev.consulted_at)}</span>
                          <p class="ev-summary">{ev.summary}</p>
                          {#if ev.supports}
                            <div class="ev-supports">
                              supports:
                              {#if ev.supports.start_doy != null}<span>start={ev.supports.start_doy}</span>{/if}
                              {#if ev.supports.end_doy != null}<span>end={ev.supports.end_doy}</span>{/if}
                              {#if ev.supports.peak_doy != null}<span>peak={ev.supports.peak_doy}</span>{/if}
                            </div>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
            {#if editMode && editingZoneId === z.id}
              <div class="editor">
                <div class="editor-row">
                  <label class="field">
                    <span>Start DOY</span>
                    <input type="number" min="1" max="365" bind:value={formStartDoy} placeholder="e.g. 175" />
                  </label>
                  <label class="field">
                    <span>End DOY</span>
                    <input type="number" min="1" max="365" bind:value={formEndDoy} placeholder="e.g. 220" />
                  </label>
                  <label class="field">
                    <span>Peak DOY</span>
                    <input type="number" min="1" max="365" bind:value={formPeakDoy} placeholder="optional" />
                  </label>
                  <label class="field">
                    <span>Confidence</span>
                    <select bind:value={formConfidence}>
                      {#each CONFIDENCE_VALUES as c}
                        <option value={c}>{confidenceLabel(c)}</option>
                      {/each}
                    </select>
                  </label>
                </div>
                <label class="field full">
                  <span>Notes (free text)</span>
                  <textarea rows="2" bind:value={formNotes} placeholder="e.g. Peak shifts ~1 week earlier in coastal microclimate."></textarea>
                </label>

                <div class="evidence-section">
                  <div class="evidence-head">Evidence log <span class="muted small">({formEvidence.length})</span></div>
                  {#if formEvidence.length > 0}
                    <ul class="evidence-list">
                      {#each formEvidence as ev, idx}
                        <li class="ev-item">
                          <div class="ev-main">
                            <strong>{ev.source}</strong>
                            {#if ev.url}
                              <a class="ev-link" href={ev.url} target="_blank" rel="noopener">↗</a>
                            {/if}
                            <span class="muted small">· {shortDate(ev.consulted_at)}</span>
                            <p class="ev-summary">{ev.summary}</p>
                            {#if ev.supports}
                              <div class="ev-supports">
                                supports:
                                {#if ev.supports.start_doy != null}<span>start={ev.supports.start_doy}</span>{/if}
                                {#if ev.supports.end_doy != null}<span>end={ev.supports.end_doy}</span>{/if}
                                {#if ev.supports.peak_doy != null}<span>peak={ev.supports.peak_doy}</span>{/if}
                                <button class="link-btn" on:click={() => applyEvidenceToForm(ev)}>copy to form</button>
                              </div>
                            {/if}
                          </div>
                          <button class="link-btn danger" on:click={() => removeEvidence(idx)}>remove</button>
                        </li>
                      {/each}
                    </ul>
                  {/if}

                  <div class="ev-add">
                    <div class="editor-row">
                      <label class="field"><span>Source name</span>
                        <input type="text" bind:value={newEvSource} placeholder="e.g. Wikipedia, USDA NRCS, Cornell CCE" />
                      </label>
                      <label class="field full"><span>URL (optional)</span>
                        <input type="url" bind:value={newEvUrl} placeholder="https://…" />
                      </label>
                    </div>
                    <label class="field full"><span>What the source said</span>
                      <textarea rows="2" bind:value={newEvSummary} placeholder="e.g. 'Article says fruit ripens late August to mid-September.'"></textarea>
                    </label>
                    <div class="editor-row">
                      <label class="field"><span>Supports start</span>
                        <input type="number" min="1" max="365" bind:value={newEvSupportsStart} placeholder="DOY" />
                      </label>
                      <label class="field"><span>Supports end</span>
                        <input type="number" min="1" max="365" bind:value={newEvSupportsEnd} placeholder="DOY" />
                      </label>
                      <label class="field"><span>Supports peak</span>
                        <input type="number" min="1" max="365" bind:value={newEvSupportsPeak} placeholder="DOY" />
                      </label>
                      <button class="add-ev" on:click={addEvidence} disabled={!newEvSource.trim() || !newEvSummary.trim()}>+ add evidence</button>
                    </div>
                  </div>
                </div>

                {#if saveError}
                  <p class="error">{saveError}</p>
                {/if}
                <div class="editor-actions">
                  <button class="link-btn danger" on:click={deleteCell} disabled={saving || !dbStages?.has(primaryStage)}>
                    Delete row
                  </button>
                  <div class="actions-right">
                    <button class="link-btn" on:click={cancelEdit} disabled={saving}>Cancel</button>
                    <button class="primary" on:click={saveCell} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
  }
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
  .picker {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    margin-bottom: 0.6rem;
  }
  .step {
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    border: 1px solid #c7d0c7;
    background: white;
    color: #3a5a3a;
    font-size: 1.2rem;
    cursor: pointer;
  }
  .step:hover { background: #f0f5ef; }
  .search {
    flex: 1;
    padding: 0.5rem 0.7rem;
    font-size: 0.95rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.4rem;
  }
  .dropdown {
    position: relative;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    box-shadow: 0 4px 14px rgba(0,0,0,0.12);
    margin-bottom: 1rem;
    max-height: 320px;
    overflow-y: auto;
  }
  .dropdown-item {
    display: flex;
    gap: 0.6rem;
    width: 100%;
    padding: 0.4rem 0.7rem;
    background: transparent;
    border: 0;
    text-align: left;
    cursor: pointer;
  }
  .dropdown-item:hover { background: #f0f5ef; }
  .dd-common { font-weight: 500; }
  .dd-sci { color: #6b7a6b; font-style: italic; }
  .species-head {
    margin: 0.6rem 0 0.4rem;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.5rem 0.8rem;
  }
  .species-head h2 { margin: 0; font-size: 1.4rem; }
  .sci { color: #6b7a6b; font-style: italic; font-size: 0.9rem; }
  .stage-tag {
    margin-left: auto;
    font-size: 0.78rem;
    color: #4a554a;
    background: #f0f5ef;
    border: 1px solid #c7d0c7;
    border-radius: 1rem;
    padding: 0.18rem 0.7rem;
    cursor: help;
  }

  .src-count, .review-chip, .smoothing-chip, .inat-ghost-chip {
    font-size: 0.75rem;
    border-radius: 1rem;
    padding: 0.15rem 0.65rem;
    border: 1px solid;
    cursor: help;
    font-variant-numeric: tabular-nums;
  }
  .smoothing-chip {
    color: #4a554a;
    background: #f0f5ef;
    border-color: #c7d0c7;
  }
  .inat-ghost-chip {
    color: #1f6f8b;
    background: #eaf3f6;
    border-color: #1f6f8b;
    font-style: italic;
  }
  .stage-tabs {
    display: inline-flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }
  .stage-tab {
    font-size: 0.78rem;
    padding: 0.2rem 0.65rem;
    border: 1px solid #c7d0c7;
    border-radius: 1rem;
    background: white;
    color: #4a554a;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .stage-tab:hover { background: #f0f5ef; }
  .stage-tab.active {
    background: #3a5a3a;
    color: white;
    border-color: #3a5a3a;
  }
  .trajectory {
    margin: 0.5rem 0 0.75rem;
    padding: 0.5rem;
    border: 1px solid #e1e8e1;
    border-radius: 0.4rem;
    background: #fafdf9;
  }
  .trajectory-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
    font-size: 0.85rem;
  }
  .trajectory-svg { display: block; max-width: 100%; }
  .trajectory-legend {
    display: flex;
    gap: 1rem;
    font-size: 0.78rem;
    color: #4a554a;
    margin-top: 0.2rem;
  }
  .trajectory-legend .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .trajectory-legend .dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    display: inline-block;
  }
  .trajectory-legend .dot-anchor {
    border: 0.5px solid #1f2a1f;
  }
  .trajectory-legend .dot-soft {
    background: white;
    border: 1.5px dashed;
  }
  .src-none   { color: #963535; background: #fff0f0; border-color: #d99090; }
  .src-thin   { color: #8a4f10; background: #fbf0e8; border-color: #d8a880; }
  .src-pair   { color: #6f5a10; background: #fbf6e8; border-color: #d8c890; }
  .src-strong { color: #2a6f2a; background: #effaef; border-color: #85c285; }
  .review-unreviewed { color: #6b7a6b; background: #f0f5ef; border-color: #c7d0c7; }
  .review-confirmed  { color: #2a6f2a; background: #e3f0db; border-color: #85c285; font-weight: 600; }
  .review-needs_work { color: #963535; background: #fff0f0; border-color: #d99090; font-weight: 600; }

  .review-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0.4rem 0 0.8rem;
    align-items: stretch;
  }
  .review-notes-input {
    flex: 1;
    min-width: 18rem;
    padding: 0.4rem 0.55rem;
    font-size: 0.85rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.35rem;
    background: white;
    color: #1f2a1f;
    font-family: inherit;
    resize: vertical;
  }
  .review-notes-input:focus { outline: 2px solid #b3d0a8; outline-offset: -1px; }
  .review-notes-input::placeholder { color: #8a948a; font-style: italic; }
  .rb {
    font-size: 0.85rem;
    padding: 0.35rem 0.85rem;
    border-radius: 0.4rem;
    border: 1px solid #c7d0c7;
    background: white;
    color: #4a554a;
    cursor: pointer;
  }
  .rb:hover:not(:disabled) { background: #f0f5ef; }
  .rb:disabled { opacity: 0.6; cursor: not-allowed; }
  .rb-confirm.active {
    background: #2a6f2a; color: white; border-color: #2a6f2a;
  }
  .rb-needs.active {
    background: #c84545; color: white; border-color: #c84545;
  }
  .legend {
    display: flex;
    gap: 1.2rem;
    flex-wrap: wrap;
    align-items: center;
    margin: 0.8rem 0 0.8rem;
    font-size: 0.83rem;
    color: #4a554a;
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .swatch {
    width: 1rem;
    height: 0.5rem;
    border-radius: 0.15rem;
    display: inline-block;
  }
  .swatch-db { background: #c84545; opacity: 0.55; }
  .swatch-evidence {
    background: linear-gradient(to bottom,
      transparent 0, transparent 1px,
      #c84545 1px, #c84545 3px,
      transparent 3px, transparent 5px,
      #c84545 5px, #c84545 7px,
      transparent 7px);
    opacity: 0.85;
  }
  .swatch-inat { background: #1f6f8b; opacity: 0.85; }
  .swatch-guide { background: #e07b3a; opacity: 0.85; }
  .swatch-pending .swatch { background: #c0c0c0; opacity: 0.4; }
  .swatch-pending { color: #8a948a; }
  .swatch-line {
    display: inline-block;
    width: 1.6rem;
    height: 0;
    border-top: 2px solid #4a554a;
    margin: 0 0.15rem;
    vertical-align: middle;
  }
  .swatch-line-dashed { border-top-style: dashed; }
  .swatch-line-dotted { border-top-style: dotted; }
  .toggle { font-size: 0.83rem; color: #4a554a; cursor: pointer; }
  .toggle input { margin-right: 0.3rem; }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    padding: 0.4rem;
  }
  /* Flex layout instead of grid: explicit widths on the side columns
     so the timeline always renders at the same width regardless of how
     many source pills land in the meta column. Without this, rows
     with more pills squeezed the timeline narrower and DOYs didn't
     line up across rows. */
  .zone-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
  }
  .zone-row:hover { background: #f7faf6; }
  .zone-label {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
    width: 6rem;
    flex-shrink: 0;
  }
  .zone-label strong { color: #1f2a1f; }
  .zone-name { font-size: 0.72rem; }
  .timeline {
    flex: 1;
    min-width: 0;
    height: auto;
  }
  :global(.timeline .axis-label) {
    fill: #8a948a;
    font-size: 9px;
    font-family: system-ui;
  }
  .row-meta {
    display: flex;
    gap: 0.3rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    width: 12rem;
    flex-shrink: 0;
  }
  .src-pill {
    font-size: 0.72rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid #e07b3a;
    color: #b85a1a;
    border-radius: 1rem;
    text-decoration: none;
    background: #fff5ec;
  }
  .src-pill:hover { background: #ffe8d0; }
  .conf-pill {
    font-size: 0.7rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.2rem;
    border: 1px solid;
    cursor: help;
  }
  /* Both DB confidence values today are AI-derived. Style them similarly
     muted to avoid implying that "curated" is human-validated. */
  .conf-curated { color: #6f5a10; border-color: #d8c890; background: #fbf6e8; }
  .conf-frost_offset { color: #5a6f6f; border-color: #b0c0c0; background: #f0f5f5; }
  .conf-cited_thin { color: #8a4f10; border-color: #d8a880; background: #fbf0e8; }

  .note-pill, .ev-pill {
    font-size: 0.68rem;
    padding: 0.05rem 0.35rem;
    border-radius: 0.2rem;
    background: #fff;
    border: 1px dashed #c7d0c7;
    color: #6b7a6b;
    cursor: help;
    font-family: inherit;
  }
  .ev-pill {
    border-style: solid;
    border-color: #b3d0a8;
    background: #f0f7ec;
    color: #2a6f2a;
  }
  .note-pill.clickable, .ev-pill.clickable { cursor: pointer; }
  .note-pill.clickable:hover { background: #f5f8f5; }
  .ev-pill.clickable:hover { background: #e3f0db; }

  .zone-pin-count {
    font-size: 0.68rem;
    color: #6b7a6b;
    font-variant-numeric: tabular-nums;
    margin-top: 0.05rem;
  }

  .row-detail {
    margin: 0.1rem 0 0.4rem 6.6rem;
    padding: 0.6rem 0.85rem;
    background: #fbfdfa;
    border: 1px solid #e1e8e1;
    border-radius: 0.35rem;
    font-size: 0.85rem;
  }
  .detail-section + .detail-section { margin-top: 0.5rem; }
  .detail-text { margin: 0.2rem 0 0; color: #1f2a1f; line-height: 1.4; }
  .evidence-list-readonly {
    list-style: none;
    margin: 0.3rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .evidence-list-readonly li {
    padding: 0.4rem 0.55rem;
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
  }

  .toggle-edit input { accent-color: #c84545; }

  .edit-btn {
    background: #3a5a3a;
    color: white;
    border: 0;
    padding: 0.18rem 0.55rem;
    border-radius: 0.25rem;
    font-size: 0.78rem;
    cursor: pointer;
  }
  .edit-btn:hover { background: #2a4a2a; }

  .source-sidebar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    padding: 0.5rem 0.7rem;
    background: #fffbf2;
    border: 1px dashed #d8c890;
    border-radius: 0.4rem;
    margin: 0 0 0.7rem;
    align-items: center;
  }
  .source-link {
    font-size: 0.83rem;
    padding: 0.18rem 0.6rem;
    border: 1px solid #d8c890;
    border-radius: 1rem;
    color: #6f5a10;
    background: white;
    text-decoration: none;
  }
  .source-link:hover { background: #fbf6e8; }

  .editor {
    background: #f7faf6;
    border: 1px solid #b3d0a8;
    border-radius: 0.4rem;
    padding: 0.7rem 0.85rem;
    margin: 0.2rem 0 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .editor-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 6rem;
  }
  .field.full { width: 100%; flex: 1 1 100%; }
  .field span {
    font-size: 0.78rem;
    color: #4a554a;
    font-weight: 500;
  }
  .field input, .field select, .field textarea {
    padding: 0.3rem 0.4rem;
    border: 1px solid #c7d0c7;
    border-radius: 0.25rem;
    font-size: 0.9rem;
    background: white;
    font-family: inherit;
  }
  .field textarea { resize: vertical; }

  .evidence-section {
    border-top: 1px dashed #c7d0c7;
    padding-top: 0.55rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .evidence-head {
    font-size: 0.85rem;
    font-weight: 600;
    color: #3a5a3a;
  }
  .evidence-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .ev-item {
    display: flex;
    gap: 0.5rem;
    padding: 0.4rem 0.55rem;
    background: white;
    border: 1px solid #c7d0c7;
    border-radius: 0.3rem;
  }
  .ev-main { flex: 1; }
  .ev-link { color: #3a5a3a; text-decoration: none; }
  .ev-summary {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: #1f2a1f;
    line-height: 1.35;
  }
  .ev-supports {
    font-size: 0.78rem;
    color: #4a554a;
    margin-top: 0.2rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .ev-supports span {
    background: #f0f5ef;
    padding: 0.05rem 0.35rem;
    border-radius: 0.2rem;
    font-variant-numeric: tabular-nums;
  }

  .ev-add {
    background: white;
    border: 1px dashed #c7d0c7;
    border-radius: 0.3rem;
    padding: 0.5rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .add-ev {
    align-self: flex-end;
    background: #3a5a3a;
    color: white;
    border: 0;
    padding: 0.35rem 0.7rem;
    border-radius: 0.25rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .add-ev:disabled { background: #b4c4b4; cursor: not-allowed; }

  .editor-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px dashed #c7d0c7;
    padding-top: 0.55rem;
  }
  .actions-right {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .link-btn {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    cursor: pointer;
    font-size: 0.85rem;
    text-decoration: underline;
    padding: 0.3rem 0.5rem;
  }
  .link-btn.danger { color: #b03030; }
  .link-btn:disabled { color: #b4c4b4; cursor: not-allowed; }
  .primary {
    background: #3a5a3a;
    color: white;
    border: 0;
    padding: 0.4rem 1rem;
    border-radius: 0.3rem;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .primary:disabled { background: #b4c4b4; cursor: not-allowed; }
</style>
