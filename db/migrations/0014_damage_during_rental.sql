DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'vehicle_damage_evidence'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%phase%'
  LOOP
    EXECUTE format('ALTER TABLE vehicle_damage_evidence DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE vehicle_damage_evidence
  ADD CONSTRAINT vehicle_damage_evidence_phase_check
  CHECK (phase IN ('BEFORE_RENTAL', 'DURING_RENTAL', 'AFTER_RETURN'));
