ALTER TYPE service_status ADD VALUE IF NOT EXISTS 'CANCELLED';
--> statement-breakpoint
ALTER TABLE rentals ADD COLUMN returned_by uuid REFERENCES users(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE vehicle_services
 ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 ADD COLUMN branch_id uuid REFERENCES branches(id) ON DELETE RESTRICT,
 ADD COLUMN service_by text NOT NULL DEFAULT 'COMPANY' CHECK(service_by IN ('COMPANY','CUSTOMER')),
 ADD COLUMN rental_id uuid REFERENCES rentals(id) ON DELETE RESTRICT,
 ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
 ADD COLUMN staff_id uuid REFERENCES users(id) ON DELETE RESTRICT,
 ADD COLUMN out_at timestamptz,
 ADD COLUMN km_reading integer,
 ADD COLUMN service_odometer_km integer,
 ADD COLUMN payment_mode payment_method,
 ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}';
UPDATE vehicle_services s SET branch_id=v.branch_id,staff_id=s.created_by FROM vehicles v WHERE v.id=s.vehicle_id;
CREATE INDEX vehicle_services_branch_index ON vehicle_services(branch_id, status);
--> statement-breakpoint
CREATE TABLE service_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_id uuid NOT NULL REFERENCES vehicle_services(id) ON DELETE RESTRICT,
 action text NOT NULL,snapshot jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),service_id uuid NOT NULL UNIQUE REFERENCES vehicle_services(id) ON DELETE RESTRICT,
 amount_baisa numeric(15,0) NOT NULL CHECK(amount_baisa>0),paid_by text NOT NULL CHECK(paid_by IN ('COMPANY','CUSTOMER')),
 payment_mode payment_method NOT NULL,recorded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE operational_settings (
 key text PRIMARY KEY,near_service_km integer NOT NULL CHECK(near_service_km BETWEEN 0 AND 100000),
 expiry_soon_days integer NOT NULL CHECK(expiry_soon_days BETWEEN 0 AND 3650),
 updated_by uuid REFERENCES users(id) ON DELETE RESTRICT,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO operational_settings(key,near_service_km,expiry_soon_days) VALUES('fleet-alerts',1000,30);
--> statement-breakpoint
CREATE TABLE user_signatures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 object_key text NOT NULL UNIQUE,content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),is_current boolean NOT NULL DEFAULT true,
 uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_signatures_one_current ON user_signatures(user_id) WHERE is_current;
CREATE INDEX user_signatures_user_index ON user_signatures(user_id,created_at);
