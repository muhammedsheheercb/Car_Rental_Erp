ALTER TABLE payments ADD COLUMN kind text NOT NULL DEFAULT 'RECEIPT', ADD COLUMN request_id uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
UPDATE payments SET kind = CASE WHEN direction = 'PAYBACK' THEN 'PAYBACK' WHEN note = 'Booking down payment' THEN 'ADVANCE' ELSE 'RECEIPT' END;
--> statement-breakpoint
CREATE UNIQUE INDEX payments_request_unique ON payments(request_id);
--> statement-breakpoint
ALTER TABLE payments ADD CONSTRAINT payments_kind_check CHECK (kind IN ('ADVANCE','RECEIPT','PAYBACK','REVERSAL') AND amount_baisa > 0);
--> statement-breakpoint
CREATE TABLE payment_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), original_payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
 reversal_payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT, replacement_payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
 reason text NOT NULL, corrected_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, corrected_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX payment_corrections_original_unique ON payment_corrections(original_payment_id);
--> statement-breakpoint
CREATE TABLE refund_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE, rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT,
 amount_baisa integer NOT NULL CHECK (amount_baisa > 0), balance_credit_baisa integer NOT NULL CHECK (balance_credit_baisa >= 0), remarks text NOT NULL,
 approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, approved_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX refund_approvals_rental_index ON refund_approvals(rental_id);
--> statement-breakpoint
CREATE TABLE finance_fines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE, kind text NOT NULL CHECK (kind IN ('NORMAL','LEGAL')),
 rental_id uuid NOT NULL REFERENCES rentals(id) ON DELETE RESTRICT, vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
 customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 date_from timestamptz NOT NULL, date_to timestamptz NOT NULL, amount_baisa integer NOT NULL CHECK (amount_baisa > 0), details text NOT NULL, remarks text,
 booking_snapshot jsonb NOT NULL, is_deleted boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (date_to >= date_from)
);
--> statement-breakpoint
CREATE INDEX finance_fines_vehicle_index ON finance_fines(vehicle_id, kind);
--> statement-breakpoint
CREATE TABLE legal_fine_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fine_id uuid NOT NULL REFERENCES finance_fines(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('CREATED','EDITED','DELETED')), snapshot jsonb NOT NULL, reason text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);
