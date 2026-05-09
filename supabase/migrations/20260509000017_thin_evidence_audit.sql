-- Honest re-grading of confidence after the thin-evidence audit.
--
-- The web-crawl agent stamped confidence='expert_verified' on every
-- row it wrote, but in practice 18 species (including Vaccinium
-- angustifolium, where the only cited fact is "growers mow plants
-- in fall after harvest" — a tangential note that doesn't actually
-- support a Jul-Aug DOY range) have only ONE evidence entry. The
-- DOY values came from the agent's training-data knowledge, not
-- from the citation. Calling them "expert_verified" overstates
-- the rigor.
--
-- Plus: the 5 sap maple species' sap_run rows from Phase A had
-- ZERO evidence entries — the citations lived in notes, which
-- the viewer doesn't surface as a clickable source.
--
-- This migration:
--   1. Adds 'cited_thin' to the confidence enum.
--   2. Downgrades 139 rows: confidence='expert_verified' with
--      evidence array of length ≤1 → 'cited_thin'. Values stay;
--      the LABEL becomes honest.
--   3. Promotes the maple notes citations into proper evidence
--      entries on the 50 sap_run rows so the viewer's paperclip
--      pill works.

alter type public.window_confidence add value if not exists 'cited_thin';

-- Downgrade thin-evidence rows.
update public.species_fruiting_windows
   set confidence = 'cited_thin'::public.window_confidence
 where confidence = 'expert_verified'
   and jsonb_array_length(coalesce(evidence, '[]'::jsonb)) <= 1;

-- Promote maple sap_run citations from notes into proper evidence
-- entries (the viewer's paperclip pill reads from the evidence array,
-- not from notes — these were inserted by Phase A with 0 evidence).
update public.species_fruiting_windows sfw
   set evidence = jsonb_build_array(
     jsonb_build_object(
       'source',       'Cornell Maple Program',
       'url',          'https://blogs.cornell.edu/cornellmaple/',
       'consulted_at', '2026-05-09T16:00:00Z',
       'summary',      'Maple sap-flow season runs during freeze-thaw cycles in late winter / early spring; flow days require night below freezing followed by day above 4 degrees C. Window varies ~1 week per zone.'
     ),
     jsonb_build_object(
       'source',       'Vermont Maple Sugar Makers Association',
       'url',          'https://vermontmaple.org/',
       'consulted_at', '2026-05-09T16:00:00Z',
       'summary',      'Sugaring season for sugar maple typically Feb-Apr in zones 4-5; red maple slightly earlier and shorter; silver maple, box elder, Amur maple all tappable on similar windows in industry practice.'
     )
   )
  from public.species sp
 where sfw.species_id = sp.id
   and sfw.stage = 'sap_run'
   and sp.scientific_name in
       ('Acer saccharum','Acer rubrum','Acer saccharinum','Acer negundo','Acer ginnala')
   and jsonb_array_length(coalesce(sfw.evidence, '[]'::jsonb)) = 0;
