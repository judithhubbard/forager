# Forager

A private, mobile-friendly map of forageable plants in Ithaca, NY.

See [`PLAN.md`](./PLAN.md) for the full design and [`AUDIT.md`](./AUDIT.md) for the implementation audit.

## Local development

Prerequisites:
- Node 20+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- A Supabase account (free tier is fine)

### One-time setup

1. Clone this repo and `cd` in.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a Supabase project for development at https://supabase.com (call it `forager-dev`). Note the project URL and anon key from Settings → API.
4. Copy the env template and fill in your dev project values:
   ```bash
   cp .env.example .env.local
   # then edit .env.local
   ```
5. Apply migrations to your dev project:
   ```bash
   supabase link --project-ref <your-dev-project-ref>
   supabase db push
   ```
6. Seed species and fruiting-window data:
   ```bash
   npm run seed
   ```
7. (Optional) Populate dev fixtures (~10 fake pins, observations, photos):
   ```bash
   npm run seed:dev
   ```

### Running the app

```bash
npm run dev
```

Visit http://localhost:5173. Sign in with the email + password you set up via the registration flow (if you don't yet have an invitation token, you can insert a row into `invitation` directly in your dev DB to test).

### Project layout

```
data/                    # Static seed data (species, fruiting windows)
scripts/                 # One-shot utilities (imports, seeds, dev fixtures)
src/
  lib/
    services/            # Domain-typed wrappers around Supabase (PinService, etc.)
    stores/              # Svelte stores (activeRegion, auth, outbox)
  routes/                # SvelteKit routes
supabase/
  migrations/            # Versioned SQL migrations (applied via supabase db push)
```

### Branching

- `main` is production. Pushing to `main` auto-deploys to GitHub Pages via Actions.
- Feature work happens on branches; merge via PR.

### Architectural ground rules

See `PLAN.md` §10 for the full list. Highlights:
- All entity IDs are client-generated UUIDs.
- All mutations go through the outbox (`src/lib/services/outbox.ts`), even when online.
- No `supabase.from(...)` calls outside `src/lib/services/`.
- The active region is read only via `useActiveRegion()`; do not read `localStorage` directly.
- Effective values (status with auto-degrade, fruiting windows with overrides) come from Postgres views; raw tables are admin/debug only.
