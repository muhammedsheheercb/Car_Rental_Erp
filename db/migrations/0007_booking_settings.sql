ALTER TABLE rentals ADD COLUMN rent_duration integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE rentals ADD COLUMN free_km integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE rentals ADD COLUMN open_km boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Preserve the historical daily charging behavior of agreements created before this migration.
UPDATE rentals SET rent_duration = GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expected_return_at - starts_at)) / 86400)::integer);
--> statement-breakpoint
ALTER TABLE rentals ADD CONSTRAINT rentals_booking_quantities_check CHECK (rent_duration > 0 AND free_km >= 0 AND included_km >= 0 AND (pickup_odometer_km IS NULL OR pickup_odometer_km >= 0));
