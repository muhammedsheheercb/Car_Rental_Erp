import { describe, expect, it } from "vitest";
import { brandSchema, vehicleSchema } from "@/lib/validation";

const base = {
  brandId: "00000000-0000-4000-8000-000000000001",
  modelId: "00000000-0000-4000-8000-000000000002",
  branchId: "00000000-0000-4000-8000-000000000003",
  year: 2024,
  cylinderCount: 4,
  color: "White",
  registrationNumber: "A 12345",
  fuelType: "PETROL",
  capacity: "2.5L",
  gearbox: "AUTOMATIC",
  seatCount: 5,
  engineNumber: "ENG-1",
  chassisNumber: "VIN-1",
  purchaseDate: new Date("2024-01-01"),
  currentOdometerKm: 1000,
  insuranceCompany: "Insurer",
  insuranceNumber: "P-1",
  insuranceValidUntil: new Date("2025-01-01"),
  lastEngineServiceKm: 800,
  lastGearOilChangeKm: 800,
  mulkiyaExpiryDate: new Date("2025-01-01"),
  engineServiceIntervalKm: 5000,
  gearOilIntervalKm: 10000,
  daily: {
    listRentBaisa: 20000,
    minimumRentBaisa: 15000,
    includedKm: 200,
    excessKmChargeBaisa: 100,
  },
  weekly: {
    listRentBaisa: 120000,
    minimumRentBaisa: 100000,
    includedKm: 1200,
    excessKmChargeBaisa: 100,
  },
  monthly: {
    listRentBaisa: 400000,
    minimumRentBaisa: 350000,
    includedKm: 5000,
    excessKmChargeBaisa: 100,
  },
  lateFeeBaisa: 5000,
};
describe("fleet validation", () => {
  it("normalizes duplicate model names", () =>
    expect(
      brandSchema.safeParse({ name: "Toyota", models: ["Land Cruiser", " land   cruiser "] })
        .success,
    ).toBe(false));
  it("rejects an inconsistent odometer/service interval setup", () =>
    expect(vehicleSchema.safeParse({ ...base, lastEngineServiceKm: 1001 }).success).toBe(false));
  it("requires nonnegative prices and kilometre quantities", () =>
    expect(
      vehicleSchema.safeParse({ ...base, daily: { ...base.daily, includedKm: -1 } }).success,
    ).toBe(false));
});
