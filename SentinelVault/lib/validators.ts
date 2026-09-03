/**
 * Input validation utilities for all supported blockchains
 */

/**
 * Validate Ethereum address format
 */
export function isValidEthAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Must be 0x + 40 hex chars, or ENS name
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
  // Simple ENS validation (contains .eth)
  if (/^[a-zA-Z0-9-]+\.eth$/.test(address)) return true;
  return false;
}

/**
 * Validate Bitcoin address format (legacy, segwit, bech32)
 */
export function isValidBtcAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  // Legacy (P2PKH): starts with 1
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  // SegWit (P2WPKH): starts with bc1 (bech32)
  if (/^bc1[ac-hj-np-z02-9]{39,59}$/i.test(address)) return true;
  // P2SH: starts with 3
  if (/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true;
  return false;
}

/**
 * Validate Solana address format (base58)
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  if (address.length !== 44 && address.length !== 43) return false;
  // Solana addresses are base58 encoded
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

/**
 * Validate amount is positive number with proper decimals
 */
export function isValidAmount(amount: string | number): boolean {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num) || num <= 0) return false;
  return true;
}

/**
 * Validate amount doesn't exceed max decimals for chain
 */
export function isValidAmountDecimals(amount: string, chain: string): boolean {
  const decimals = chain === "bitcoin" ? 8 : chain === "solana" ? 9 : 18;
  const parts = amount.split(".");
  if (parts.length === 2) {
    return parts[1].length <= decimals;
  }
  return true;
}

/**
 * Validate address based on chain
 */
export function isValidAddress(address: string, chain: string): { valid: boolean; error?: string } {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, error: "Address cannot be empty" };
  }

  if (chain === "ethereum") {
    if (!isValidEthAddress(trimmed)) {
      return { valid: false, error: "Invalid Ethereum address format (must be 0x... or .eth)" };
    }
  } else if (chain === "bitcoin") {
    if (!isValidBtcAddress(trimmed)) {
      return { valid: false, error: "Invalid Bitcoin address format (P2PKH, P2SH, or bech32)" };
    }
  } else if (chain === "solana") {
    if (!isValidSolanaAddress(trimmed)) {
      return { valid: false, error: "Invalid Solana address format (base58)" };
    }
  }

  return { valid: true };
}

/**
 * Validate complete transaction input
 */
export function validateTxInput(
  from: string,
  to: string,
  amount: string,
  chain: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate from address
  const fromCheck = isValidAddress(from, chain);
  if (!fromCheck.valid) {
    errors.push(`From address: ${fromCheck.error}`);
  }

  // Validate to address
  const toCheck = isValidAddress(to, chain);
  if (!toCheck.valid) {
    errors.push(`To address: ${toCheck.error}`);
  }

  // Validate they're different
  if (from.toLowerCase() === to.toLowerCase()) {
    errors.push("From and to addresses cannot be the same");
  }

  // Validate amount
  if (!isValidAmount(amount)) {
    errors.push("Amount must be a positive number");
  }

  if (!isValidAmountDecimals(amount, chain)) {
    const decimals = chain === "bitcoin" ? 8 : chain === "solana" ? 9 : 18;
    errors.push(`Amount exceeds ${decimals} decimal places`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
