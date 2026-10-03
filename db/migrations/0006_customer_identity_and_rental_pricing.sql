ALTER TABLE "rentals" ADD COLUMN "pricing_period" "pricing_period" NOT NULL DEFAULT 'DAILY';
CREATE UNIQUE INDEX "customers_driving_licence_unique" ON "customers" ("driving_licence_number");
CREATE UNIQUE INDEX "customers_civil_id_unique" ON "customers" ("civil_id_number") WHERE "civil_id_number" IS NOT NULL;
CREATE UNIQUE INDEX "customers_passport_unique" ON "customers" ("passport_number") WHERE "passport_number" IS NOT NULL;
