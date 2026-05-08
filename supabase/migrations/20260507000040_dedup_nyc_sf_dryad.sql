-- Drop dryad-trees-new-york and dryad-trees-san-francisco — every
-- pin in those sources duplicates a pin in the direct-source NYC
-- OpenData / DataSF imports (nyc-trees-2015 and sf-street-trees).
--
-- Audit findings:
--   163,529 duplicate groups across all sources, 166,072 redundant
--   pins. Of those:
--     - 156,202 dryad-trees-new-york + nyc-trees-2015 (essentially
--       all 156k NYC pins)
--     - 7,326 dryad-trees-san-francisco + sf-street-trees
--     - 1 incidental cross-city boundary
--
-- The direct-source imports (nyc-trees-2015, sf-street-trees) are
-- fresher (NYC OpenData updates yearly; Dryad's 2022 snapshot is
-- frozen) and were the system's first-class sources for those
-- cities. Dryad's NYC and SF rows are bonus duplicates with no
-- additional information.
--
-- Disable the visibility-gate trigger for the bulk delete (same
-- pattern the importers use): the gate blocks updates on public
-- pins by non-creators, but a direct-DB delete shouldn't be gated.

alter table public.pins disable trigger tg_gate_public_pins;
-- Density-grid triggers fire per-row on delete; 165k × per-row
-- density update times out the statement. Disable, then refresh
-- the grid once at the end.
alter table public.pins disable trigger tg_pin_density_track_ins;
alter table public.pins disable trigger tg_pin_density_track_upd;
alter table public.pins disable trigger tg_pin_density_track_del;

delete from public.pins
 where import_source in ('dryad-trees-new-york', 'dryad-trees-san-francisco');

delete from public.import_sources
 where id in ('dryad-trees-new-york', 'dryad-trees-san-francisco');

alter table public.pins enable trigger tg_gate_public_pins;
alter table public.pins enable trigger tg_pin_density_track_ins;
alter table public.pins enable trigger tg_pin_density_track_upd;
alter table public.pins enable trigger tg_pin_density_track_del;

-- Refresh the pre-aggregated density grid so the heatmap reflects
-- the deleted pins. Cheap (~1s).
select public.refresh_pin_density();
