CREATE TYPE "public"."fuel_type" AS ENUM('PETROL', 'DIESEL', 'HYBRID', 'ELECTRIC');--> statement-breakpoint
CREATE TYPE "public"."gearbox_type" AS ENUM('AUTOMATIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."pricing_period" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('AVAILABLE', 'INACTIVE');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'BRAND_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'BRAND_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'BRAND_DEACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'VEHICLE_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'VEHICLE_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'VEHICLE_DEACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'PRICE_OVERRIDDEN';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'ODOMETER_RECORDED';--> statement-breakpoint
CREATE TABLE "vehicle_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_insurance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"company" text NOT NULL,
	"policy_number" text NOT NULL,
	"valid_until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_odometer_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"odometer_km" integer NOT NULL,
	"recorded_by" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"period" "pricing_period" NOT NULL,
	"list_rent_baisa" integer NOT NULL,
	"minimum_rent_baisa" integer NOT NULL,
	"included_km" integer NOT NULL,
	"excess_km_charge_baisa" integer NOT NULL,
	"late_fee_baisa" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"mulkiya_expiry_date" date NOT NULL,
	"issuing_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_service_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"last_engine_service_km" integer NOT NULL,
	"last_gear_oil_change_km" integer NOT NULL,
	"engine_service_interval_km" integer NOT NULL,
	"gear_oil_interval_km" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vehicle_number" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"cylinder_count" integer NOT NULL,
	"color" text NOT NULL,
	"registration_number" text NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"capacity" text NOT NULL,
	"gearbox" "gearbox_type" NOT NULL,
	"seat_count" integer NOT NULL,
	"engine_number" text NOT NULL,
	"chassis_number" text NOT NULL,
	"purchase_date" date NOT NULL,
	"current_odometer_km" integer NOT NULL,
	"status" "vehicle_status" DEFAULT 'AVAILABLE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_insurance" ADD CONSTRAINT "vehicle_insurance_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_brand_id_vehicle_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."vehicle_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_odometer_history" ADD CONSTRAINT "vehicle_odometer_history_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_odometer_history" ADD CONSTRAINT "vehicle_odometer_history_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_pricing" ADD CONSTRAINT "vehicle_pricing_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_registrations" ADD CONSTRAINT "vehicle_registrations_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_service_settings" ADD CONSTRAINT "vehicle_service_settings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_brand_id_vehicle_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."vehicle_brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_brands_normalized_name_unique" ON "vehicle_brands" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_insurance_vehicle_unique" ON "vehicle_insurance" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_models_brand_name_unique" ON "vehicle_models" USING btree ("brand_id","normalized_name");--> statement-breakpoint
CREATE INDEX "vehicle_models_brand_index" ON "vehicle_models" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "vehicle_odometer_vehicle_index" ON "vehicle_odometer_history" USING btree ("vehicle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_pricing_vehicle_period_unique" ON "vehicle_pricing" USING btree ("vehicle_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_registrations_vehicle_unique" ON "vehicle_registrations" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_service_settings_vehicle_unique" ON "vehicle_service_settings" USING btree ("vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_number_unique" ON "vehicles" USING btree ("vehicle_number");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_registration_unique" ON "vehicles" USING btree ("registration_number");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_chassis_unique" ON "vehicles" USING btree ("chassis_number");--> statement-breakpoint
CREATE INDEX "vehicles_branch_index" ON "vehicles" USING btree ("branch_id");