// SPA mode: all routing is client-side. We host as a static bundle on
// GitHub Pages, so SSR makes no sense, and prerendering pages that depend
// on the live session is incorrect.
export const ssr = false;
export const prerender = false;
