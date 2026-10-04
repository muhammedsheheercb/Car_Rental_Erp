ALTER TABLE rentals ADD COLUMN segment_started_at timestamptz;
--> statement-breakpoint
CREATE TABLE rental_vehicle_swaps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
 previous_vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 new_vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 segment_started_at timestamptz NOT NULL, transferred_at timestamptz NOT NULL,
 expected_return_at timestamptz NOT NULL,
 starting_km integer NOT NULL, ending_km integer NOT NULL, new_starting_km integer NOT NULL,
 remaining_maximum_km integer NOT NULL, remaining_free_km integer NOT NULL,
 charges_baisa numeric(15,0) NOT NULL, balance_baisa numeric(15,0) NOT NULL,
 received_baisa numeric(15,0) NOT NULL, snapshot jsonb NOT NULL, remarks text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(previous_vehicle_id <> new_vehicle_id), CHECK(ending_km >= starting_km),
 CHECK(transferred_at >= segment_started_at), CHECK(expected_return_at > transferred_at),
 CHECK(remaining_maximum_km >= 0 AND remaining_free_km >= 0 AND charges_baisa >= 0 AND received_baisa >= 0)
);
CREATE INDEX rental_swaps_booking_index ON rental_vehicle_swaps(rental_id, transferred_at);
--> statement-breakpoint
CREATE TABLE invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number text NOT NULL UNIQUE, request_id uuid NOT NULL UNIQUE,
 rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
 branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','FINALIZED','VOID')),
 subtotal_baisa numeric(15,0) NOT NULL, washing_baisa numeric(15,0) NOT NULL, petrol_baisa numeric(15,0) NOT NULL,
 discount_baisa numeric(15,0) NOT NULL, grand_total_baisa numeric(15,0) NOT NULL,
 advance_baisa numeric(15,0) NOT NULL, received_baisa numeric(15,0) NOT NULL, balance_baisa numeric(15,0) NOT NULL,
 adjustment_baisa numeric(15,0) NOT NULL DEFAULT 0, snapshot jsonb NOT NULL, remarks text,
 created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(subtotal_baisa >= 0 AND washing_baisa >= 0 AND petrol_baisa >= 0 AND discount_baisa >= 0 AND grand_total_baisa >= 0 AND advance_baisa >= 0 AND received_baisa >= 0)
);
CREATE UNIQUE INDEX invoices_one_finalized_booking ON invoices(rental_id) WHERE status = 'FINALIZED';
CREATE INDEX invoices_booking_index ON invoices(rental_id);
--> statement-breakpoint
CREATE TABLE invoice_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 action text NOT NULL, snapshot jsonb NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint
-- Preserve exact baisa values while moving all monetary columns to NUMERIC.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = 'public' AND data_type = 'integer' AND column_name LIKE '%baisa'
 LOOP EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE numeric(15,0) USING %I::numeric(15,0)', c.table_name, c.column_name, c.column_name); END LOOP;
END $$;
