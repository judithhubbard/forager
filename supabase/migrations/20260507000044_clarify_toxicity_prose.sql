-- Reword toxicity_notes so the "danger" statement comes first under
-- the "Toxicity" section header. The earlier wording started by
-- listing the edible parts ("Only flowers and very young pods…")
-- which under the header "Toxicity" reads as if those parts are
-- the toxic ones — exactly the opposite of intent.
--
-- User report: "The text in Eastern Redbud: 'Toxicity / Only
-- flowers and very young pods' suggests that the flowers and
-- young pods are toxic."

update public.species
   set toxicity_notes = $$Mature pods, leaves, bark, and seeds may cause mild digestive upset and should not be eaten. Only the flowers and very young (under 1 inch) pods are edible.$$
 where scientific_name = 'Cercis canadensis';

update public.species
   set toxicity_notes = $$Most Cornus species (flowering dogwood, etc.) bear non-edible fruit; eating them causes mild GI upset. Only the cornelian-cherry-type species (C. mas, C. officinalis) are foraged for fruit — confirm species before eating.$$
 where scientific_name = 'Cornus sp.';

update public.species
   set toxicity_notes = $$Bark, leaves, seeds, and roots contain robin and phasin toxins — historically caused livestock deaths. Pods (which look pea-like) should NOT be eaten. Only the flowers are edible.$$
 where scientific_name = 'Robinia pseudoacacia';
