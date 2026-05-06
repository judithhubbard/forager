// Base-aware navigation. SvelteKit's `goto()` does NOT auto-prepend
// `paths.base`, so on production (where base = '/forager') a call like
// `goto('/login')` lands at https://judithhubbard.github.io/login —
// outside the GitHub Pages subpath — and 404s. This wrapper prepends
// the base for any path that starts with '/' (i.e. an in-app absolute
// path); external URLs and already-prefixed paths pass through.

import { goto as sveltekitGoto } from '$app/navigation';
import { base } from '$app/paths';

type GotoOpts = Parameters<typeof sveltekitGoto>[1];

export function goto(path: string, opts?: GotoOpts): Promise<void> {
  let target = path;
  if (path.startsWith('/') && !path.startsWith(base + '/') && path !== base) {
    target = `${base}${path}`;
  }
  return sveltekitGoto(target, opts);
}

/** For use in templates: `<a href={href('/admin')}>...</a>`. */
export function href(path: string): string {
  if (path.startsWith('/') && !path.startsWith(base + '/') && path !== base) {
    return `${base}${path}`;
  }
  return path;
}
