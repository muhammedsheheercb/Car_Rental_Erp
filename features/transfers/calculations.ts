import { MAX_BAISA, money } from "@/features/finance/calculations";
export function transferMileage(input: {
  startingKm: number;
  endingKm: number;
  maximumKm: number;
  freeKm: number;
  excessRateBaisa: number;
  openKm: boolean;
}) {
  for (const value of [
    input.startingKm,
    input.endingKm,
    input.maximumKm,
    input.freeKm,
    input.excessRateBaisa,
  ])
    money(value);
  if (input.endingKm < input.startingKm) throw new Error("Ending KM cannot be below starting KM.");
  const totalKm = input.endingKm - input.startingKm;
  const remainingMaximumKm = Math.max(0, input.maximumKm - totalKm);
  const remainingFreeKm = Math.max(0, input.freeKm - Math.max(0, totalKm - input.maximumKm));
  const extraKm = input.openKm ? 0 : Math.max(0, totalKm - input.maximumKm - input.freeKm);
  const extraBaisa = extraKm * input.excessRateBaisa;
  if (!Number.isSafeInteger(extraBaisa) || extraBaisa > MAX_BAISA)
    throw new Error("Excess KM charge is too large.");
  return { totalKm, extraKm, extraBaisa, remainingMaximumKm, remainingFreeKm };
}
export function transferBalance(balance: number, charges: number, received: number) {
  if (!Number.isSafeInteger(balance)) throw new Error("Invalid balance.");
  money(charges);
  money(received);
  const collectible = Math.max(0, balance + charges);
  if (received > collectible) throw new Error("Received amount exceeds the outstanding balance.");
  return { balanceToTransfer: balance + charges, newBalance: balance + charges - received };
}
