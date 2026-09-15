CREATE TYPE "public"."customer_document_type" AS ENUM('LICENCE_FRONT', 'LICENCE_BACK', 'SIGNATURE', 'CIVIL_ID', 'PASSPORT', 'VISA');
CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "customer_number" text NOT NULL, "name" text NOT NULL, "mobile" text NOT NULL, "email" text, "address" text NOT NULL, "remarks" text,
  "civil_id_number" text, "civil_id_expiry" date, "passport_number" text, "passport_expiry" date, "visa_number" text, "visa_expiry" date,
  "driving_licence_number" text NOT NULL, "driving_licence_expiry" date NOT NULL, "sponsor_details" text, "is_active" boolean DEFAULT true NOT NULL, "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "customers_number_unique" ON "customers" USING btree ("customer_number");
CREATE UNIQUE INDEX "customers_mobile_unique" ON "customers" USING btree ("mobile");
CREATE INDEX "customers_name_index" ON "customers" USING btree ("name");
CREATE TABLE "customer_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "customer_id" uuid NOT NULL, "type" "customer_document_type" NOT NULL, "object_key" text NOT NULL, "content_type" text NOT NULL, "size_bytes" integer NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict
);
CREATE UNIQUE INDEX "customer_document_type_unique" ON "customer_documents" USING btree ("customer_id", "type");
CREATE TABLE "customer_blacklist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "customer_id" uuid NOT NULL, "reason" text NOT NULL, "starts_at" date, "ends_at" date, "is_active" boolean DEFAULT true NOT NULL, "deactivated_at" timestamp with time zone, "actor_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "customer_blacklist_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict,
  CONSTRAINT "customer_blacklist_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE set null
);
CREATE INDEX "customer_blacklist_customer_index" ON "customer_blacklist" USING btree ("customer_id", "created_at");
