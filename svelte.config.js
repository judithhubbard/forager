import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // SPA fallback: every unknown route is served the SvelteKit shell,
      // which then hydrates and routes client-side. Required for GitHub
      // Pages, which has no server-side routing.
      fallback: 'index.html',
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
