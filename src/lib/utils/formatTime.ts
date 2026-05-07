// Compact "elapsed" formatting for recorder UIs. Was duplicated
// across Map.svelte, RecorderBadge, and /tracks +page.svelte; pulled
// here so a future change (e.g., showing tenths of seconds) stays
// in one place.

/** Format a millisecond duration as M:SS or H:MM:SS. Negative or
 *  zero inputs render as 0:00 so paused / pre-fix UIs aren't blank. */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Auto-name for a recorded track from its start timestamp. */
export function autoTrackTitle(startedAtMs: number | null): string {
  const d = startedAtMs ? new Date(startedAtMs) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `Track ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
