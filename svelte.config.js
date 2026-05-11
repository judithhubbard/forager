import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.env.NODE_ENV !== 'production';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // SPA fallback: every unknown route is served the SvelteKit
      // shell, which then hydrates and routes client-side. The deploy
      // workflow copies this file to 404.html as well so GitHub Pages
      // serves the shell on deep links it can't resolve.
      fallback: 'index.html',
      precompress: false,
      strict: true
    }),
    paths: {
      // Deployment-target-aware base path:
      //   GitHub Pages (current):  BASE_PATH=/forager (set in deploy.yml)
      //   Cloudflare Pages:        BASE_PATH=''       (serves at domain root)
      //   Custom domain:           BASE_PATH=''       (CNAME → either host)
      //   Local dev:               base = ''          (dev override below)
      //
      // The whole app uses SvelteKit's $app/paths.base + the goto() helper
      // in src/lib/utils/nav.ts, so flipping BASE_PATH is the only change
      // needed on platform migration — no hardcoded `/forager` paths in
      // source. See PLAN §11 / tasks #84-88 for the migration plan.
      base: dev ? '' : (process.env.BASE_PATH ?? '')
    }
  }
};

export default config;
