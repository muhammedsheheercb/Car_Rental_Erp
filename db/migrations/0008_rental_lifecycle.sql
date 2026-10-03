ALTER TABLE vehicle_pricing ADD COLUMN late_grace_minutes integer NOT NULL DEFAULT 60, ADD COLUMN late_window_hours integer NOT NULL DEFAULT 4, ADD COLUMN overdue_fine_baisa integer NOT NULL DEFAULT 5000;
--> statement-breakpoint
ALTER TABLE rentals ADD COLUMN late_grace_minutes integer NOT NULL DEFAULT 60, ADD COLUMN late_window_hours integer NOT NULL DEFAULT 4, ADD COLUMN overdue_fine_baisa integer NOT NULL DEFAULT 5000, ADD COLUMN additional_day_rent_baisa integer NOT NULL DEFAULT 0, ADD COLUMN cancellation_window_minutes integer NOT NULL DEFAULT 15;
--> statement-breakpoint
UPDATE rentals r SET additional_day_rent_baisa = COALESCE((SELECT list_rent_baisa FROM vehicle_pricing p WHERE p.vehicle_id = r.vehicle_id AND p.period = 'DAILY'), r.daily_rate_baisa);
--> statement-breakpoint
CREATE TABLE rental_extensions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
 previous_expected_return_at timestamptz NOT NULL, new_expected_return_at timestamptz NOT NULL,
 duration integer NOT NULL CHECK (duration > 0), period pricing_period NOT NULL,
 additional_rent_baisa integer NOT NULL CHECK (additional_rent_baisa >= 0),
 approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz NOT NULL DEFAULT now(), remarks text NOT NULL,
 CHECK (new_expected_return_at > previous_expected_return_at)
);
--> statement-breakpoint
CREATE INDEX rental_extensions_rental_index ON rental_extensions(rental_id, approved_at);
--> statement-breakpoint
CREATE TABLE rental_cancellations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT UNIQUE,
 previous_status rental_status NOT NULL, starting_km integer NOT NULL CHECK (starting_km >= 0), ending_km integer NOT NULL,
 remarks text NOT NULL, overridden boolean NOT NULL DEFAULT false,
 cancelled_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, cancelled_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ending_km >= starting_km)
);
--> statement-breakpoint
CREATE TABLE vehicle_damage_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
 vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 phase text NOT NULL CHECK (phase IN ('BEFORE_RENTAL', 'AFTER_RETURN')), location text NOT NULL, description text NOT NULL, remarks text,
 object_key text NOT NULL, content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
 recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, recorded_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX vehicle_damage_rental_phase_index ON vehicle_damage_evidence(rental_id, phase);
--> statement-breakpoint
ALTER TABLE rentals ADD CONSTRAINT rental_late_policy_check CHECK (late_grace_minutes >= 0 AND late_window_hours BETWEEN 0 AND 23 AND late_grace_minutes + late_window_hours * 60 < 1440 AND overdue_fine_baisa >= 0 AND additional_day_rent_baisa >= 0 AND cancellation_window_minutes >= 0);
--> statement-breakpoint
ALTER TABLE vehicle_pricing ADD CONSTRAINT pricing_late_policy_check CHECK (late_grace_minutes >= 0 AND late_window_hours BETWEEN 0 AND 23 AND late_grace_minutes + late_window_hours * 60 < 1440 AND overdue_fine_baisa >= 0);

--> statement-breakpoint
ALTER TABLE rental_charges ADD COLUMN component text NOT NULL DEFAULT 'RENTAL';
