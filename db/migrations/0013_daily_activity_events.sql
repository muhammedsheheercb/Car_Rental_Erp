ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'CUSTOMER_CREATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'CUSTOMER_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'CUSTOMER_DEACTIVATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'CUSTOMER_DELETED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BLACKLIST_CREATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BLACKLIST_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BLACKLIST_REMOVED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BOOKING_CREATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BOOKING_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'BOOKING_DELETED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'RENTAL_STARTED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'RENTAL_EXTENDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'RENTAL_RETURNED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'RENTAL_CANCELLED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'DAMAGE_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'VEHICLE_TRANSFERRED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'VEHICLE_SWAPPED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'ADVANCE_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'RECEIPT_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'PAYBACK_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'PAYMENT_CORRECTED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'REFUND_APPROVED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'FINE_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'LEGAL_FINE_RECORDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'LEGAL_FINE_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'LEGAL_FINE_DELETED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'INVOICE_CREATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'INVOICE_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'INVOICE_FINALIZED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'INVOICE_VOIDED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'SERVICE_CREATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'SERVICE_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'SERVICE_COMPLETED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'SETTINGS_UPDATED';
--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'SIGNATURE_UPDATED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_index" ON "audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_event_created_index" ON "audit_logs" ("event", "created_at");
