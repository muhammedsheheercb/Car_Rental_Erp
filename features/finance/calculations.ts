export const MAX_BAISA = 2_147_483_647;
export function money(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid financial amount.");
  return value;
}
export function parseOMR(value: string): number {
  const text = value.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(text)) throw new Error("Enter an OMR amount with at most three decimals.");
  const [whole, fraction = ""] = text.split(".");
  const baisa = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (baisa > BigInt(MAX_BAISA)) throw new Error("Amount is too large.");
  return Number(baisa);
}
export function calculateBalance(debits: number, credits: number) {
  return money(debits) - money(credits);
}
export function calculatePayback(approvedBaisa: number, returnedBaisa: number, balanceBaisa: number) {
  money(approvedBaisa); money(returnedBaisa);
  if (!Number.isSafeInteger(balanceBaisa)) throw new Error("Invalid balance.");
  if (returnedBaisa > approvedBaisa) throw new Error("Paybacks exceed approved entitlement.");
  const remainingBaisa = approvedBaisa - returnedBaisa;
  return { approvedBaisa, returnedBaisa, remainingBaisa, payableBaisa: Math.min(remainingBaisa, Math.max(0, -balanceBaisa)) };
}
export function assertPaymentAllowed(amount: number, maximum: number) {
  money(amount); money(maximum);
  if (!amount || amount > MAX_BAISA) throw new Error("Payment must be a positive valid amount.");
  if (amount > maximum) throw new Error("Payment exceeds the remaining permitted amount.");
}
export function refundApprovalCredit(balance: number, previousRemaining: number, additionalApproved: number) {
  money(previousRemaining); money(additionalApproved);
  return Math.max(0, balance + previousRemaining + additionalApproved);
}
