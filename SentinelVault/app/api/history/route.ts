/**
 * Server-side API route for fetching 7-day historical price data
 * Avoids client-side CORS issues and rate limiting
 */

export const runtime = "nodejs";

const COINGECKO_API = "https://api.coingecko.com/api/v3";

interface PricePoint {
  timestamp: number;
  price: number;
}

interface HistoricalData {
  [key: string]: PricePoint[];
}

export async function GET() {
  try {
    // Fetch 7-day price history for each coin
    const coins = ["bitcoin", "ethereum", "solana"];
    const historicalData: HistoricalData = {
      bitcoin: [],
      ethereum: [],
      solana: [],
    };

    await Promise.all(
      coins.map(async (coin) => {
        try {
          const response = await fetch(
            `${COINGECKO_API}/coins/${coin}/market_chart?vs_currency=usd&days=7&interval=hourly&x_cg_pro_api_key=${process.env.COINGECKO_API_KEY || ""}`,
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
          
          // Extract prices from the response
          if (data.prices && Array.isArray(data.prices)) {
            historicalData[coin] = data.prices.map(([timestamp, price]: [number, number]) => ({
              timestamp,
              price,
            }));
          }
        } catch (error) {
          console.error(`Failed to fetch ${coin} history:`, error);
          // Return empty array on error
          historicalData[coin] = [];
        }
      })
    );

    console.log("Fetched historical data for 7 days");

    return Response.json(historicalData, {
      headers: {
        "Cache-Control": "public, max-age=3600, must-revalidate", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Failed to fetch historical price data:", error);

    // Return empty historical data on error
    return Response.json(
      {
        bitcoin: [],
        ethereum: [],
        solana: [],
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600",
        },
      }
    );
  }
}
