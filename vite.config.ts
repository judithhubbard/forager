import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Capture the current git short SHA at build time so the running
// app can show 'which build am I looking at' — useful while the
// app is iterating fast and someone might be on a stale cache.
// Falls back to 'dev' if git isn't available.
const BUILD_REV = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  define: {
    __BUILD_REV__: JSON.stringify(BUILD_REV)
  },
  plugins: [sveltekit()],
  server: {
    fs: {
      // Allow imports from the project's `data/` directory — the canonical
      // seed JSON lives there and is read both at runtime (for reference
      // values shown in the harvest-windows editor) and by the seed script.
      allow: ['..']
    }
  }
});
