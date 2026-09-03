/**
 * Wallet persistence and state management
 * Stores connected wallet addresses in localStorage
 */

const WALLET_STORAGE_KEY = "sentinelvault_wallets";
const STORAGE_VERSION = 1;

export interface StoredWallet {
  ethereum: string;
  bitcoin: string;
  solana: string;
}

/**
 * Load wallet addresses from localStorage
 */
export function loadWallets(): StoredWallet | null {
  if (typeof window === "undefined") {
    return null; // Server-side rendering
  }

  try {
    const stored = localStorage.getItem(WALLET_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Validate version and structure
    if (parsed.version !== STORAGE_VERSION) {
      return null; // Incompatible version
    }

    return parsed.wallets || null;
  } catch (error) {
    console.error("Failed to load wallets from localStorage:", error);
    return null;
  }
}

/**
 * Save wallet addresses to localStorage
 */
export function saveWallets(wallets: Partial<StoredWallet>): void {
  if (typeof window === "undefined") {
    return; // Server-side rendering
  }

  try {
    const current = loadWallets() || { ethereum: "", bitcoin: "", solana: "" };
    const updated = { ...current, ...wallets };

    localStorage.setItem(
      WALLET_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        wallets: updated,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error("Failed to save wallets to localStorage:", error);
  }
}

/**
 * Clear wallet addresses from localStorage
 */
export function clearWallets(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear wallets from localStorage:", error);
  }
}

/**
 * Save a single wallet address
 */
export function saveWallet(chain: "ethereum" | "bitcoin" | "solana", address: string): void {
  saveWallets({
    [chain]: address,
  });
}

/**
 * Get a single wallet address
 */
export function getWallet(chain: "ethereum" | "bitcoin" | "solana"): string {
  const wallets = loadWallets();
  return wallets?.[chain] || "";
}

/**
 * Check if any wallets are stored
 */
export function hasStoredWallets(): boolean {
  const wallets = loadWallets();
  return !!(
    wallets?.ethereum ||
    wallets?.bitcoin ||
    wallets?.solana
  );
}
