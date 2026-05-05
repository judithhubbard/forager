import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    // Build-time stamp for service-worker cache versioning (PLAN §B12).
    // The service worker reads __BUILD_VERSION__ and uses it as a cache key.
    __BUILD_VERSION__: JSON.stringify(new Date().toISOString())
  }
});
