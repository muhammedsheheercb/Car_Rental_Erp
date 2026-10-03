import { z } from "zod";
import { parseOmanDateTime } from "@/features/rentals/booking-calculations";
import { parseOMR } from "./calculations";
const amount = z.string().transform((value, ctx) => {
  try { return parseOMR(value); } catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid amount." }); return z.NEVER; }
});
const date = z.string().transform((value, ctx) => {
  try { return parseOmanDateTime(value); } catch { ctx.addIssue({ code: "custom", message: "Enter a valid Oman date/time." }); return z.NEVER; }
});
export const financePaymentSchema = z.object({
  rentalId: z.string().uuid(), requestId: z.string().uuid(), kind: z.enum(["ADVANCE", "RECEIPT", "PAYBACK"]),
  amount, method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]), reference: z.string().trim().max(120).optional(),
  remarks: z.string().trim().max(1000).optional(),
}).refine((value) => value.amount > 0, { message: "Amount must be greater than zero.", path: ["amount"] });
export const refundSchema = z.object({ rentalId: z.string().uuid(), requestId: z.string().uuid(), amount,
  remarks: z.string().trim().min(1, "Refund approval remarks are required.").max(1000) }).refine((value) => value.amount > 0, { message: "Refund must be positive." });
export const correctionSchema = z.object({ paymentId: z.string().uuid(), amount, method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  remarks: z.string().trim().min(1, "Correction reason is required.").max(1000), reference: z.string().trim().max(120).optional() });
export const fineSchema = z.object({ rentalId: z.string().uuid(), requestId: z.string().uuid(), kind: z.enum(["NORMAL", "LEGAL"]),
  dateFrom: date, dateTo: date, amount, details: z.string().trim().min(1).max(2000), remarks: z.string().trim().max(1000).optional(),
}).refine((value) => value.dateTo >= value.dateFrom, { message: "Date To cannot be before Date From." })
  .refine((value) => value.amount > 0, { message: "Fine amount must be positive." });
