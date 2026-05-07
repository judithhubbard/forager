/// <reference types="@sveltejs/kit" />

// Build-time-injected git short SHA (see vite.config.ts → define).
// Surfaced as a tiny chip on the map so we can tell which build a
// user is looking at when reproducing UI bugs.
declare const __BUILD_REV__: string;
