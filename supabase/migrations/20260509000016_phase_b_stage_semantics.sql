-- Phase B: harvest-stage cleanup. Today most non-fruit foragable
-- species had stage='ripe' rows because the web-crawl agent stored
-- everything that way "per table convention" — even though pawpaw
-- ripening, ramp leaf-harvest, asparagus shoots, Jerusalem-artichoke
-- tuber-dig, and morel flushes are biologically distinct events.
--
-- Worse, pin_is_edible_now had per-part logic that mapped
--   leaf / shoot / bark / bulb → look up stage='green'
--   root                       → look up stage='past'
--   flower / sap               → look up stage='flowering'
-- which meant the "edible now" indicator silently returned false for
-- all those species: their cal data was stored as 'ripe', not what
-- pin_is_edible_now was searching for.
--
-- This migration:
--   1. Adds new stage enum values for the missing harvest types.
--   2. Re-stages existing rows where stage='ripe' but the species'
--      forage_parts indicate a different harvest type. 443 rows
--      reclassified.
--   3. Rewires pin_is_edible_now to map each forage_part to the
--      correct new stage value, so the lookup actually finds the
--      data for non-fruit species.

-- (1) Enum values. Each ALTER TYPE runs as its own statement.
alter type public.stage add value if not exists 'shoot';
alter type public.stage add value if not exists 'leaf';
alter type public.stage add value if not exists 'flower_harvest';
alter type public.stage add value if not exists 'root_dig';
alter type public.stage add value if not exists 'mushroom_flush';
alter type public.stage add value if not exists 'bark_strip';

-- (2) Re-stage rows. Priority: mushroom first, then fruit/nut/seed
-- (canonical 'ripe'), then shoot/leaf/root/flower/bark. Matches the
-- biological-precedence pattern in pin_is_edible_now below.
update public.species_fruiting_windows sfw
   set stage = case
     when 'mushroom' = any(sp.forage_parts) then 'mushroom_flush'::public.stage
     when array['fruit','nut','seed']::text[] && sp.forage_parts then 'ripe'::public.stage
     when 'shoot' = any(sp.forage_parts) then 'shoot'::public.stage
     when 'leaf'  = any(sp.forage_parts) then 'leaf'::public.stage
     when 'root'  = any(sp.forage_parts) then 'root_dig'::public.stage
     when 'flower'= any(sp.forage_parts) then 'flower_harvest'::public.stage
     when 'bark'  = any(sp.forage_parts) then 'bark_strip'::public.stage
     else stage
   end
  from public.species sp
 where sfw.species_id = sp.id
   and sfw.stage = 'ripe';

-- (3) Rewire pin_is_edible_now. Each forage_part maps to its
-- harvest-stage equivalent; multi-part species check multiple
-- stages and ANY in-window returns true.
create or replace function public.pin_is_edible_now(
  p_pin_id uuid,
  p_target_date date default null::date,
  p_buffer_days integer default 10
) returns boolean
language plpgsql stable
as $fn$
declare
  parts text[];
  st public.stage;
  stages_to_check public.stage[] := array[]::public.stage[];
begin
  select s.forage_parts into parts
    from public.pins p
    join public.species s on s.id = p.species_id
   where p.id = p_pin_id;
  if parts is null then return false; end if;

  if 'fruit' = any(parts) or 'nut' = any(parts) or 'seed' = any(parts) then
    stages_to_check := stages_to_check || array['ripe'::public.stage];
  end if;
  if 'mushroom' = any(parts) then
    stages_to_check := stages_to_check || array['mushroom_flush'::public.stage];
  end if;
  if 'sap' = any(parts) then
    stages_to_check := stages_to_check || array['sap_run'::public.stage];
  end if;
  if 'shoot' = any(parts) then
    stages_to_check := stages_to_check || array['shoot'::public.stage];
  end if;
  if 'leaf' = any(parts) or 'bulb' = any(parts) then
    stages_to_check := stages_to_check || array['leaf'::public.stage];
  end if;
  if 'root' = any(parts) then
    stages_to_check := stages_to_check || array['root_dig'::public.stage];
  end if;
  if 'flower' = any(parts) then
    stages_to_check := stages_to_check || array['flower_harvest'::public.stage];
  end if;
  if 'bark' = any(parts) then
    stages_to_check := stages_to_check || array['bark_strip'::public.stage];
  end if;

  if array_length(stages_to_check, 1) is null then return false; end if;

  foreach st in array stages_to_check loop
    if public.pin_in_window(p_pin_id, st, null, p_target_date, p_buffer_days) then
      return true;
    end if;
  end loop;
  return false;
end;
$fn$;
