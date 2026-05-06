import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // SPA fallback: GitHub Pages serves 404.html for any path it
      // can't resolve, so writing the SvelteKit shell to that filename
      // makes deep links (/forager/admin, /forager/accept?token=...)
      // hydrate and route client-side. The root index.html is still
      // produced by adapter-static for the home URL.
      fallback: '404.html',
      precompress: false,
      strict: true
    }),
    paths: {
      // GitHub Pages serves at /<repo-name>/. Override at build time
      // via BASE_PATH=/forager (or set to '' for a custom domain).
      base: dev ? '' : (process.env.BASE_PATH ?? '')
    }
  }
};

export default config;
