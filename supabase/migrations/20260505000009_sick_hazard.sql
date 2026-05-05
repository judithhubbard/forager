-- Add 'sick' as a hazard type for diseased / infected trees.
-- Examples: serviceberry rust, butternut canker, dogwood anthracnose,
-- chestnut blight. Distinct from 'gone' (already dead) — these are pins
-- you've seen producing badly because of disease.

alter type hazard_type add value if not exists 'sick';
