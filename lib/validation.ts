import { z } from "zod";

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
