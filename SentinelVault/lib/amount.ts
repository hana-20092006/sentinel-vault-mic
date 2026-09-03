export function parseAmountToBaseUnits(amount: string | number, decimals: number): bigint {
  const normalized = String(amount).trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive decimal number");
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places`);
  }

  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+(?=\d)/, "");

  return BigInt(combined || "0");
}
