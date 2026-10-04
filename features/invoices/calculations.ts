import { MAX_BAISA, money } from "@/features/finance/calculations";
export function invoiceCalculation(input: {
  deposit?: number;
  subtotal: number;
  washing: number;
  petrol: number;
  discount: number;
  advance: number;
  previouslyReceived: number;
  paybacks: number;
  received: number;
}) {
  for (const value of Object.values(input)) money(value);
  const beforeDiscount = input.subtotal + input.washing + input.petrol;
  if (input.discount > beforeDiscount) throw new Error("Discount cannot exceed invoice subtotal.");
  const grandTotal = beforeDiscount - input.discount + (input.deposit ?? 0);
  if (grandTotal > MAX_BAISA) throw new Error("Invoice total is too large.");
  const outstanding = Math.max(
    0,
    grandTotal - input.advance - input.previouslyReceived + input.paybacks,
  );
  if (input.received > outstanding)
    throw new Error("Received amount exceeds the valid outstanding amount.");
  return {
    subtotal: beforeDiscount,
    grandTotal,
    outstanding,
    balance:
      grandTotal - input.advance - input.previouslyReceived + input.paybacks - input.received,
  };
}
export function omrInput(baisa: number): string {
  if (!Number.isSafeInteger(baisa)) throw new Error("Invalid amount.");
  const n = BigInt(baisa);
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${abs / 1000n}.${String(abs % 1000n).padStart(3, "0")}`;
}
