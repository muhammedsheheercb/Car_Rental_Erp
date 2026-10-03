import { z } from "zod";
import { parseOmanDateTime } from "@/features/rentals/booking-calculations";

const trimmed = z.string().trim().min(1, "Required");
export const loginSchema = z.object({
  username: trimmed.min(3).max(64),
  password: z.string().min(1),
});
export const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(128),
});
export const branchSchema = z.object({
  name: trimmed.max(120),
  location: trimmed.max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,16}$/),
});
export const branchCreateSchema = branchSchema.omit({ code: true });
export const userSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,64}$/),
  displayName: trimmed.max(120),
  initialPassword: z.string().min(12).max(128),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]),
  branchIds: z.array(z.string().uuid()),
  permissions: z.array(
    z.string().regex(/^[a-z_]+:(create|read|update|delete|print|export|approve|override_price)$/),
  ),
});

const nonnegative = z.coerce.number().int().min(0);
export const normalizeMasterName = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const brandSchema = z
  .object({ name: trimmed.max(100), models: z.array(trimmed.max(100)).min(1) })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, model] of value.models.entries()) {
      const normalized = normalizeMasterName(model);
      if (seen.has(normalized))
        ctx.addIssue({ code: "custom", path: ["models", index], message: "Duplicate model." });
      seen.add(normalized);
    }
  });
const pricing = z.object({
  listRentBaisa: nonnegative,
  minimumRentBaisa: nonnegative,
  includedKm: nonnegative,
  excessKmChargeBaisa: nonnegative,
});
export const vehicleSchema = z
  .object({
    vehicleNumber: z.string().trim().min(2).max(40),
    brandId: z.string().uuid(),
    modelId: z.string().uuid(),
    branchId: z.string().uuid(),
    year: z.coerce
      .number()
      .int()
      .min(1980)
      .max(new Date().getFullYear() + 1),
    cylinderCount: z.coerce.number().int().min(1).max(16),
    color: trimmed.max(60),
    registrationNumber: trimmed.max(40),
    fuelType: z.enum(["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]),
    capacity: trimmed.max(40),
    gearbox: z.enum(["AUTOMATIC", "MANUAL"]),
    seatCount: z.coerce.number().int().min(1).max(80),
    engineNumber: trimmed.max(80),
    chassisNumber: trimmed.max(80),
    purchaseDate: z.coerce.date(),
    currentOdometerKm: nonnegative,
    insuranceCompany: trimmed.max(100),
    insuranceNumber: trimmed.max(80),
    insuranceValidUntil: z.coerce.date(),
    lastEngineServiceKm: nonnegative,
    lastGearOilChangeKm: nonnegative,
    mulkiyaExpiryDate: z.coerce.date(),
    mulkiyaIssuingDetail: z.string().trim().max(100).optional(),
    engineServiceIntervalKm: z.coerce.number().int().min(1),
    gearOilIntervalKm: z.coerce.number().int().min(1),
    daily: pricing,
    weekly: pricing,
    monthly: pricing,
    lateFeeBaisa: nonnegative,
    lateGraceMinutes: z.coerce.number().int().min(0).max(120).default(60),
    lateWindowHours: z.coerce.number().int().min(0).max(20).default(4),
    overdueFineBaisa: nonnegative.default(5000),
    overrideReason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.purchaseDate > new Date())
      ctx.addIssue({
        code: "custom",
        path: ["purchaseDate"],
        message: "Purchase date cannot be in the future.",
      });
    if (value.insuranceValidUntil < value.purchaseDate)
      ctx.addIssue({
        code: "custom",
        path: ["insuranceValidUntil"],
        message: "Insurance date must follow purchase date.",
      });
    if (value.lastEngineServiceKm > value.currentOdometerKm)
      ctx.addIssue({
        code: "custom",
        path: ["lastEngineServiceKm"],
        message: "Cannot exceed current odometer.",
      });
    if (value.lastGearOilChangeKm > value.currentOdometerKm)
      ctx.addIssue({
        code: "custom",
        path: ["lastGearOilChangeKm"],
        message: "Cannot exceed current odometer.",
      });
  });

const optionalDate = z
  .union([z.coerce.date(), z.literal("").transform(() => undefined)])
  .optional();
export const customerSchema = z
  .object({
    name: trimmed.max(160),
    mobile: z
      .string()
      .trim()
      .regex(
        /^(?:\+968\s?)?[279]\d{7}$|^\+[1-9]\d{7,14}$/,
        "Enter a valid Oman or international mobile number.",
      ),
    email: z.union([z.literal(""), z.string().trim().email()]).optional(),
    address: trimmed.max(500),
    remarks: z.string().trim().max(2000).optional(),
    civilIdNumber: z.string().trim().max(80).optional(),
    civilIdExpiry: optionalDate,
    passportNumber: z.string().trim().max(80).optional(),
    passportExpiry: optionalDate,
    visaNumber: z.string().trim().max(80).optional(),
    visaExpiry: optionalDate,
    drivingLicenceNumber: trimmed.max(80),
    drivingLicenceExpiry: z.coerce.date(),
    sponsorDetails: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    for (const [number, expiry, label] of [
      [value.civilIdNumber, value.civilIdExpiry, "Civil ID"],
      [value.passportNumber, value.passportExpiry, "Passport"],
      [value.visaNumber, value.visaExpiry, "Visa"],
    ] as const)
      if ((number && !expiry) || (!number && expiry))
        ctx.addIssue({
          code: "custom",
          message: `${label} number and expiry must be entered together.`,
        });
  });

export const reservationSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  branchId: z.string().uuid(),
  pickupBranchId: z.string().uuid(),
  returnBranchId: z.string().uuid(),
  startsAt: z.string().transform((value, ctx) => {
    try {
      return parseOmanDateTime(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid pickup date/time in Oman time." });
      return z.NEVER;
    }
  }),
  rentDuration: z.coerce.number().int().min(1).max(365),
  freeKm: z.coerce.number().int().min(0).max(2_147_483_647),
  pickupOdometerKm: z.coerce.number().int().min(0).max(2_147_483_647),
  openKm: z.preprocess((value) => value === "on" || value === true, z.boolean()),
  downPaymentBaisa: z.coerce.number().int().min(0).max(2_147_483_647),
  paymentMode: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  pricingPeriod: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  dailyRateBaisa: z.coerce.number().int().min(0).max(2_147_483_647),
  includedKm: z.coerce.number().int().min(0).max(2_147_483_647),
  excessKmChargeBaisa: z.coerce.number().int().min(0).max(2_147_483_647),
  lateFeeBaisa: z.coerce.number().int().min(0).max(2_147_483_647),
  depositBaisa: z.coerce.number().int().min(0).max(2_147_483_647),
  notes: z.string().trim().max(1000).optional(),
});

export const extensionSchema = z.object({
  rentalId: z.string().uuid(),
  duration: z.coerce.number().int().min(1).max(365),
  remarks: z.string().trim().min(1, "Remarks are required.").max(1000),
});
export const cancellationSchema = z
  .object({
    rentalId: z.string().uuid(),
    confirmed: z.literal("on", { error: "Confirm Cancel Agreement." }),
    startingKm: z.coerce.number().int().min(0).max(2_147_483_647),
    endingKm: z.coerce.number().int().min(0).max(2_147_483_647),
    remarks: z.string().trim().min(1, "Remarks are required.").max(1000),
  })
  .refine((value) => value.endingKm >= value.startingKm, {
    message: "Ending KM cannot be below starting KM.",
    path: ["endingKm"],
  });
export const damageSchema = z.object({
  rentalId: z.string().uuid(),
  phase: z.enum(["BEFORE_RENTAL", "AFTER_RETURN"]),
  location: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  remarks: z.string().trim().max(1000).optional(),
});
