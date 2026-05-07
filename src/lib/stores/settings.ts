// Persistent UI settings — basemap choice for now, plus room to grow.

import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Basemap = 'osm-hot' | 'satellite';
export type ColorBy = 'group' | 'category';
/** Mirrors the photos_license_check constraint (see
 *  20260506000010_photo_attribution.sql). */
export type PhotoLicense =
  | 'CC-BY-SA-4.0'
  | 'CC-BY-4.0'
  | 'CC-BY-NC-SA-4.0'
  | 'CC0'
  | 'all-rights-reserved';

const KEY = 'forager.settings.v1';

interface Settings {
  basemap: Basemap;
  /** ISO timestamp the user clicked "I understand" on the foraging
   *  disclaimer. Null = never shown / never dismissed → modal will
   *  appear on next map load. */
  disclaimerAcceptedAt: string | null;
  /** How map markers are colored.
   *   'group'    → per-group hue (default; uses curated overrides + golden-angle generator)
   *   'category' → 5 category colors only (less varied; useful when many active species) */
  colorBy: ColorBy;
  /** Default license stamped on every uploaded photo. Picker lives in
   *  the tools menu; the value sticks across uploads so the user
   *  doesn't have to reselect each time. */
  defaultPhotoLicense: PhotoLicense;
  /** Show the foraging heatmap (built from the user's uploaded
   *  tracks) overlaid on the map. Defaults off to keep the initial
   *  paint clean. */
  showHeatmap: boolean;
  /** At cluster-zoom (zoom < CLUSTER_BELOW_ZOOM in +page.svelte),
   *  render cluster centroids as a weighted heat layer instead of
   *  numbered count dots. Useful for spotting density at a glance;
   *  the count dots tell you "how many," the heatmap tells you
   *  "where." Off by default. Has no effect at high zoom (already
   *  showing individual pins). */
  showPinHeatmap: boolean;
}
const DEFAULT: Settings = {
  basemap: 'osm-hot',
  disclaimerAcceptedAt: null,
  colorBy: 'group',
  defaultPhotoLicense: 'CC-BY-SA-4.0',
  showHeatmap: false,
  showPinHeatmap: false
};

const ALLOWED_LICENSES: PhotoLicense[] = [
  'CC-BY-SA-4.0',
  'CC-BY-4.0',
  'CC-BY-NC-SA-4.0',
  'CC0',
  'all-rights-reserved'
];

/** Migrate older saved values to the current option set. */
function normalize(s: Partial<Settings>): Settings {
  const allowed: Basemap[] = ['osm-hot', 'satellite'];
  const b = s.basemap && allowed.includes(s.basemap) ? s.basemap : DEFAULT.basemap;
  const cb: ColorBy = s.colorBy === 'category' ? 'category' : 'group';
  const lic: PhotoLicense =
    s.defaultPhotoLicense && ALLOWED_LICENSES.includes(s.defaultPhotoLicense)
      ? s.defaultPhotoLicense
      : DEFAULT.defaultPhotoLicense;
  return {
    basemap: b,
    disclaimerAcceptedAt: s.disclaimerAcceptedAt ?? null,
    colorBy: cb,
    defaultPhotoLicense: lic,
    showHeatmap: !!s.showHeatmap,
    showPinHeatmap: !!s.showPinHeatmap
  };
}

function load(): Settings {
  if (!browser) return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return normalize(parsed);
  } catch {
    return DEFAULT;
  }
}

function makeStore(): Writable<Settings> {
  const s = writable<Settings>(load());
  if (browser) {
    s.subscribe((v) => {
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
    });
  }
  return s;
}

export const settings = makeStore();

export function setBasemap(b: Basemap): void {
  settings.update((s) => ({ ...s, basemap: b }));
}

export function setColorBy(cb: ColorBy): void {
  settings.update((s) => ({ ...s, colorBy: cb }));
}

export function setDefaultPhotoLicense(lic: PhotoLicense): void {
  settings.update((s) => ({ ...s, defaultPhotoLicense: lic }));
}

export function setShowHeatmap(v: boolean): void {
  settings.update((s) => ({ ...s, showHeatmap: v }));
}

export function setShowPinHeatmap(v: boolean): void {
  settings.update((s) => ({ ...s, showPinHeatmap: v }));
}
