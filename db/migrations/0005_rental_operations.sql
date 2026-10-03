CREATE TYPE "rental_status" AS ENUM ('RESERVED', 'ACTIVE', 'RETURNED', 'CANCELLED');
CREATE TYPE "payment_method" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE');
CREATE TYPE "payment_direction" AS ENUM ('RECEIPT', 'PAYBACK');
CREATE TYPE "ledger_entry_type" AS ENUM ('RENT_CHARGE', 'DEPOSIT', 'PAYMENT', 'PAYBACK', 'FINE', 'LEGAL_FINE', 'DAMAGE', 'ADJUSTMENT');
CREATE TYPE "service_status" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "rentals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "agreement_number" text NOT NULL UNIQUE,
  "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT, "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT,
  "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT, "pickup_branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "return_branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT, "status" "rental_status" NOT NULL DEFAULT 'RESERVED',
  "starts_at" timestamptz NOT NULL, "expected_return_at" timestamptz NOT NULL, "actual_return_at" timestamptz, "pickup_odometer_km" integer, "return_odometer_km" integer,
  "daily_rate_baisa" integer NOT NULL, "included_km" integer NOT NULL, "excess_km_charge_baisa" integer NOT NULL, "late_fee_baisa" integer NOT NULL,
  "deposit_baisa" integer NOT NULL DEFAULT 0, "subtotal_baisa" integer NOT NULL DEFAULT 0, "tax_baisa" integer NOT NULL DEFAULT 0, "total_baisa" integer NOT NULL DEFAULT 0,
  "notes" text, "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK ("expected_return_at" > "starts_at"), CHECK ("daily_rate_baisa" >= 0), CHECK ("deposit_baisa" >= 0)
);
CREATE INDEX "rentals_vehicle_status_dates_index" ON "rentals" ("vehicle_id", "status", "starts_at");
CREATE INDEX "rentals_branch_status_index" ON "rentals" ("branch_id", "status", "starts_at");
CREATE INDEX "rentals_customer_index" ON "rentals" ("customer_id", "created_at");

CREATE TABLE "rental_charges" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "rental_id" uuid NOT NULL REFERENCES "rentals"("id") ON DELETE RESTRICT, "type" "ledger_entry_type" NOT NULL, "description" text NOT NULL, "amount_baisa" integer NOT NULL, "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "created_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX "rental_charges_rental_index" ON "rental_charges" ("rental_id", "created_at");
CREATE TABLE "payments" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "receipt_number" text NOT NULL UNIQUE, "rental_id" uuid REFERENCES "rentals"("id") ON DELETE RESTRICT, "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT, "branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT, "direction" "payment_direction" NOT NULL, "method" "payment_method" NOT NULL, "amount_baisa" integer NOT NULL CHECK ("amount_baisa" > 0), "reference" text, "note" text, "received_at" timestamptz NOT NULL DEFAULT now(), "recorded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX "payments_customer_index" ON "payments" ("customer_id", "received_at");
CREATE INDEX "payments_rental_index" ON "payments" ("rental_id", "received_at");
CREATE TABLE "customer_ledger" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT, "rental_id" uuid REFERENCES "rentals"("id") ON DELETE RESTRICT, "payment_id" uuid REFERENCES "payments"("id") ON DELETE RESTRICT, "type" "ledger_entry_type" NOT NULL, "debit_baisa" integer NOT NULL DEFAULT 0 CHECK ("debit_baisa" >= 0), "credit_baisa" integer NOT NULL DEFAULT 0 CHECK ("credit_baisa" >= 0), "description" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), CHECK ("debit_baisa" > 0 OR "credit_baisa" > 0));
CREATE INDEX "customer_ledger_customer_index" ON "customer_ledger" ("customer_id", "created_at");
CREATE TABLE "vehicle_transfers" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT, "from_branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT, "to_branch_id" uuid NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT, "transferred_at" timestamptz NOT NULL DEFAULT now(), "received_at" timestamptz, "notes" text, "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CHECK ("from_branch_id" <> "to_branch_id"));
CREATE INDEX "vehicle_transfers_vehicle_index" ON "vehicle_transfers" ("vehicle_id", "transferred_at");
CREATE TABLE "vehicle_services" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "vehicle_id" uuid NOT NULL REFERENCES "vehicles"("id") ON DELETE RESTRICT, "status" "service_status" NOT NULL DEFAULT 'SCHEDULED', "type" text NOT NULL, "due_date" date, "due_odometer_km" integer, "completed_at" timestamptz, "cost_baisa" integer NOT NULL DEFAULT 0 CHECK ("cost_baisa" >= 0), "vendor" text, "note" text, "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
CREATE INDEX "vehicle_services_due_index" ON "vehicle_services" ("vehicle_id", "status", "due_date");
