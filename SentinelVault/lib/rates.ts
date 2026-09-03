/**
 * Live exchange rate fetching from CoinGecko API via our server route
 * Provides current USD prices for BTC, ETH, SOL
 */

export interface ExchangeRates {
  ethereum: number;
  bitcoin: number;
  solana: number;
}

export const FALLBACK_RATES: ExchangeRates = {
  ethereum: 3500,
  bitcoin: 67000,
  solana: 180,
};

// Cache to avoid excessive API calls
let ratesCache: ExchangeRates | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10000; // 10 seconds

/**
 * Fetch current exchange rates from CoinGecko via our API route
 * Cached for 1 minute to avoid excessive API calls
 */
export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();

  // Return cached rates if still valid
  if (ratesCache && now - cacheTimestamp < CACHE_DURATION) {
    return ratesCache;
  }

  try {
    const response = await fetch(
      "/api/rates",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch rates: ${response.status}`);
    }

    const data = await response.json();

    ratesCache = {
      ethereum: data.ethereum || FALLBACK_RATES.ethereum,
      bitcoin: data.bitcoin || FALLBACK_RATES.bitcoin,
      solana: data.solana || FALLBACK_RATES.solana,
    };

    cacheTimestamp = now;
    return ratesCache;
  } catch (error) {
    // Return cached rates even if stale, or fallback values
    if (ratesCache) {
      return ratesCache;
    }

    return FALLBACK_RATES;
  }
}

/**
 * Get USD value for a given amount
 * @param amount Amount in the smallest unit (e.g., wei for ETH, satoshi for BTC)
 * @param chain Chain name ("ethereum", "bitcoin", "solana")
 * @param decimals Number of decimal places for the chain
 */
export async function getUSDValue(
  amount: string | number,
  chain: "ethereum" | "bitcoin" | "solana",
  decimals: number
): Promise<number> {
  const rates = await getExchangeRates();
  const rate = rates[chain];

  // Convert from smallest unit to full coin
  const fullAmount = Number(amount) / Math.pow(10, decimals);

  return fullAmount * rate;
}
