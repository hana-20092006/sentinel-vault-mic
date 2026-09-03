/**
 * Server-side API route for fetching live exchange rates
 * Avoids client-side CORS issues and rate limiting
 */

export const runtime = "nodejs";

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const CRYPTO_COMPARE_API = "https://min-api.cryptocompare.com/data/price";

// Fallback rates (updated periodically)
const FALLBACK_RATES = {
  ethereum: 3500,
  bitcoin: 67000,
  solana: 180,
};

async function fetchFromCoinGecko(): Promise<any> {
  const response = await fetch(
    `${COINGECKO_API}/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&x_cg_pro_api_key=${process.env.COINGECKO_API_KEY || ""}`,
    {
      headers: {
        "Accept-Encoding": "gzip",
        "User-Agent": "SentinelVault/1.0",
      },
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    ethereum: data.ethereum?.usd ?? FALLBACK_RATES.ethereum,
    bitcoin: data.bitcoin?.usd ?? FALLBACK_RATES.bitcoin,
    solana: data.solana?.usd ?? FALLBACK_RATES.solana,
  };
}

async function fetchFromCryptoCompare(): Promise<any> {
  const response = await fetch(
    `${CRYPTO_COMPARE_API}?fsym=USD&tsyms=BTC,ETH,SOL`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(`CryptoCompare API error: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    ethereum: data.ETH ? 1 / data.ETH : FALLBACK_RATES.ethereum,
    bitcoin: data.BTC ? 1 / data.BTC : FALLBACK_RATES.bitcoin,
    solana: data.SOL ? 1 / data.SOL : FALLBACK_RATES.solana,
  };
}

export async function GET(request: Request) {
  try {
    let rates = null;
    let lastError = null;

    // Try CoinGecko first
    try {
      console.log("Attempting CoinGecko API...");
      rates = await fetchFromCoinGecko();
      console.log("✅ CoinGecko API successful");
    } catch (error) {
      lastError = error;
      console.warn("CoinGecko API failed:", error);
      
      // Try CryptoCompare as fallback
      try {
        console.log("Attempting CryptoCompare API...");
        rates = await fetchFromCryptoCompare();
        console.log("✅ CryptoCompare API successful");
      } catch (cryptoCompareError) {
        console.warn("CryptoCompare API also failed:", cryptoCompareError);
      }
    }

    // If both APIs failed, use fallback rates
    if (!rates) {
      console.log("Using fallback rates due to API failures");
      rates = FALLBACK_RATES;
    }

    console.log("Final rates:", rates);

    return Response.json(rates, {
      headers: {
        "Cache-Control": "public, max-age=30, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Unexpected error in rates API:", error);

    // Return fallback rates as last resort
    return Response.json(FALLBACK_RATES, {
      headers: {
        "Cache-Control": "public, s-maxage=60",
      },
    });
  }
}
