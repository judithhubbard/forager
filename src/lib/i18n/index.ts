// i18n scaffolding (Phase 1G). English-only at v1; the structure
// here is what matters — adding a locale later is a translation
// task (drop a new JSON file, register it) not a refactor.
//
// Usage in Svelte components:
//   <script>import { _ } from 'svelte-i18n';</script>
//   <p>{$_('welcome.lead')}</p>
//
// Keys are namespaced by feature/area. See en.json for the canonical
// structure. Missing-key fallbacks: svelte-i18n returns the key
// itself, so a typo surfaces visibly rather than silently rendering
// nothing.

import { register, init, getLocaleFromNavigator } from 'svelte-i18n';

register('en', () => import('./en.json'));

/** Best-effort locale negotiation. We currently only ship 'en' so
 *  any unsupported locale falls back to it via the fallbackLocale. */
init({
  fallbackLocale: 'en',
  initialLocale: getLocaleFromNavigator() ?? 'en'
});
