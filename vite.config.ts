import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
