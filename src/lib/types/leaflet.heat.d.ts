// leaflet.heat ships no .d.ts. We import it for the side effect of
// extending L.heatLayer at runtime and never reference its module
// surface directly, so a one-line ambient module declaration is
// enough to keep TypeScript happy.
declare module 'leaflet.heat';
