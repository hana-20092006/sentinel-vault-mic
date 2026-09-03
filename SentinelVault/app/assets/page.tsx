"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { getBalance } from "../../lib/api";
import { isValidAddress } from "../../lib/validators";
import { getExchangeRates, type ExchangeRates } from "../../lib/rates";
import { fetchERC20Tokens } from "../../lib/erc20";
import { fetchSPLTokens } from "../../lib/spl";
import { loadWallets, saveWallets } from "../../lib/walletStorage";

interface Asset {
  chain: string;
  symbol: string;
  balance: number;
  isLoading: boolean;
  error?: string;
}

const CHAINS = ["ethereum", "bitcoin", "solana"] as const;
const SYMBOLS: Record<string, string> = {
  ethereum: "ETH",
  bitcoin: "BTC",
  solana: "SOL",
};

export default function AssetsPage() {
  const [addresses, setAddresses] = useState<Record<string, string>>({
    ethereum: "",
    bitcoin: "",
    solana: "",
  });

  const [assets, setAssets] = useState<Record<string, Asset>>({
    ethereum: { chain: "ethereum", symbol: "ETH", balance: 0, isLoading: false },
    bitcoin: { chain: "bitcoin", symbol: "BTC", balance: 0, isLoading: false },
    solana: { chain: "solana", symbol: "SOL", balance: 0, isLoading: false },
  });

  const [totalValue, setTotalValue] = useState<Record<string, number>>({
    ethereum: 0,
    bitcoin: 0,
    solana: 0,
  });

  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [ratesLoading, setRatesLoading] = useState(true);

  // Load live exchange rates on component mount and set up polling
  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await getExchangeRates();
        setExchangeRates(rates);
        console.log("Exchange rates updated:", rates);
      } catch (error) {
        console.error("Failed to load exchange rates:", error);
      } finally {
        setRatesLoading(false);
      }
    };

    // Load immediately
    loadRates();

    // Load stored wallets
    const stored = loadWallets();
    if (stored) {
      setAddresses(stored as unknown as Record<string, string>);
    }

    // Set up polling every 10 seconds
    const interval = setInterval(() => {
      loadRates();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleAddressChange = (chain: string, value: string) => {
    setAddresses((prev) => ({
      ...prev,
      [chain]: value,
    }));
    // Save to localStorage for persistence
    saveWallets({ [chain as "ethereum" | "bitcoin" | "solana"]: value });
  };

  const handleFetchBalance = async (chain: string) => {
    const address = addresses[chain].trim();

    if (!address) {
      setAssets((prev) => ({
        ...prev,
        [chain]: {
          ...prev[chain],
          error: "Address cannot be empty",
          balance: 0,
        },
      }));
      return;
    }

    const validation = isValidAddress(address, chain);
    if (!validation.valid) {
      setAssets((prev) => ({
        ...prev,
        [chain]: {
          ...prev[chain],
          error: validation.error,
          balance: 0,
        },
      }));
      return;
    }

    setAssets((prev) => ({
      ...prev,
      [chain]: {
        ...prev[chain],
        isLoading: true,
        error: undefined,
      },
    }));

    try {
      const balance = await getBalance(chain, address);
      const rate = (exchangeRates as any)?.[chain] || 0;
      const usdValue = balance * rate;

      setAssets((prev) => ({
        ...prev,
        [chain]: {
          ...prev[chain],
          balance,
          isLoading: false,
          error: undefined,
        },
      }));

      setTotalValue((prev) => ({
        ...prev,
        [chain]: usdValue,
      }));
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to fetch balance";
      setAssets((prev) => ({
        ...prev,
        [chain]: {
          ...prev[chain],
          isLoading: false,
          error: errorMsg,
          balance: 0,
        },
      }));
    }
  };

  const handleFetchAll = async () => {
    for (const chain of CHAINS) {
      if (addresses[chain].trim()) {
        await handleFetchBalance(chain);
      }
    }
  };

  const grandTotal = Object.values(totalValue).reduce((a, b) => a + b, 0);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900, width: "100%" }}>
        <style>{`
          @media (max-width: 768px) {
            .assets-page {
              max-width: 100% !important;
            }
          }
        `}</style>
        <h1
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: "var(--spacing-2)",
          }}
        >
          Assets
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginBottom: "var(--spacing-6)",
          }}
        >
          Enter your wallet addresses to view real portfolio balances.
        </p>

        {/* Wallet Input Section */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface-container)",
            marginBottom: "var(--spacing-6)",
            padding: "var(--spacing-4)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "0.9375rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 var(--spacing-4) 0",
            }}
          >
            Connect Wallets
          </h3>

          {CHAINS.map((chain) => (
            <div key={chain} style={{ marginBottom: "var(--spacing-4)" }}>
              <label
                htmlFor={`wallet-${chain}`}
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  display: "block",
                  marginBottom: "var(--spacing-2)",
                }}
              >
                {SYMBOLS[chain]} ({chain.charAt(0).toUpperCase() + chain.slice(1)})
              </label>
              <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
                <input
                  id={`wallet-${chain}`}
                  name={`wallet-${chain}`}
                  type="text"
                  placeholder={`Enter ${chain} address...`}
                  value={addresses[chain]}
                  onChange={(e) => handleAddressChange(chain, e.target.value)}
                  style={{
                    flex: 1,
                    background: "var(--bg-surface-lowest)",
                    border: "1px solid var(--ghost-border)",
                    borderRadius: "var(--radius-lg)",
                    padding: "0.625rem 1rem",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.8125rem",
                  }}
                />
                <button
                  onClick={() => handleFetchBalance(chain)}
                  disabled={
                    assets[chain].isLoading || !addresses[chain].trim()
                  }
                  style={{
                    padding: "0.625rem 1rem",
                    background: "var(--primary)",
                    color: "var(--text-on-primary)",
                    border: "none",
                    borderRadius: "var(--radius-lg)",
                    cursor: assets[chain].isLoading
                      ? "not-allowed"
                      : "pointer",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    opacity: assets[chain].isLoading ? 0.6 : 1,
                  }}
                >
                  {assets[chain].isLoading ? "Loading..." : "Fetch"}
                </button>
              </div>
              {assets[chain].error && (
                <p
                  style={{
                    color: "var(--error)",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.75rem",
                    margin: "var(--spacing-1) 0 0",
                  }}
                >
                  {assets[chain].error}
                </p>
              )}
            </div>
          ))}

          <button
            onClick={handleFetchAll}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)",
              color: "var(--text-on-primary)",
              border: "none",
              borderRadius: "var(--radius-lg)",
              cursor: "pointer",
              fontFamily: "var(--font-headline)",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginTop: "var(--spacing-4)",
            }}
          >
            Fetch All Balances
          </button>
        </div>

        {/* Portfolio Summary */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface-container)",
            marginBottom: "var(--spacing-6)",
            padding: "var(--spacing-4)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "0.9375rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 var(--spacing-4) 0",
            }}
          >
            Total Portfolio Value
          </h3>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: "var(--primary)",
              fontFamily: "var(--font-headline)",
              marginBottom: "var(--spacing-4)",
            }}
          >
            ${grandTotal.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>

        {/* Live Exchange Rates */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface-container)",
            marginBottom: "var(--spacing-6)",
            padding: "var(--spacing-4)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "0.9375rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 var(--spacing-4) 0",
            }}
          >
            Live Exchange Rates {!ratesLoading && exchangeRates && <span style={{ color: "var(--primary)", fontSize: "0.75rem", fontWeight: 400, marginLeft: "0.5rem" }}>(live)</span>}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "var(--spacing-4)",
            }}
            className="rates-grid"
          >
            <style>{`
              @media (max-width: 768px) {
                .rates-grid {
                  grid-template-columns: 1fr !important;
                }
              }
              @media (max-width: 1024px) and (min-width: 769px) {
                .rates-grid {
                  grid-template-columns: 1fr 1fr !important;
                }
              }
            `}</style>
            {/* Bitcoin Rate */}
            <div style={{ padding: "var(--spacing-3)", background: "var(--bg-surface-lowest)", borderRadius: "var(--radius-lg)" }}>
              <p
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 var(--spacing-2) 0",
                }}
              >
                Bitcoin (BTC)
              </p>
              <p
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--primary)",
                  margin: 0,
                }}
              >
                ${(exchangeRates?.bitcoin || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* Ethereum Rate */}
            <div style={{ padding: "var(--spacing-3)", background: "var(--bg-surface-lowest)", borderRadius: "var(--radius-lg)" }}>
              <p
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 var(--spacing-2) 0",
                }}
              >
                Ethereum (ETH)
              </p>
              <p
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--primary)",
                  margin: 0,
                }}
              >
                ${(exchangeRates?.ethereum || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>

            {/* Solana Rate */}
            <div style={{ padding: "var(--spacing-3)", background: "var(--bg-surface-lowest)", borderRadius: "var(--radius-lg)" }}>
              <p
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "0 0 var(--spacing-2) 0",
                }}
              >
                Solana (SOL)
              </p>
              <p
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--primary)",
                  margin: 0,
                }}
              >
                ${(exchangeRates?.solana || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Assets table */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <style>{`
            @media (max-width: 768px) {
              .assets-table-header, .assets-table-row {
                grid-template-columns: 1fr !important;
              }
              .assets-column-balance, .assets-column-price, .assets-column-total {
                display: none !important;
              }
              .assets-row-mobile {
                display: grid !important;
                grid-template-columns: 1fr 1fr;
                gap: var(--spacing-2);
              }
            }
          `}</style>
          {/* Header */}
          <div
            className="assets-table-header"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              padding: "0 var(--spacing-4)",
              fontFamily: "var(--font-label)",
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid var(--ghost-border)",
              paddingBottom: "var(--spacing-2)",
              marginBottom: "var(--spacing-2)",
            }}
          >
            <div>Asset</div>
            <div style={{ textAlign: "right" }}>Balance</div>
            <div style={{ textAlign: "right" }}>Price</div>
            <div style={{ textAlign: "right" }}>Total</div>
          </div>

          {/* Asset Rows */}
          {CHAINS.map((chain) => {
            const asset = assets[chain];
            const usdValue = totalValue[chain];
            const rate = (exchangeRates as any)?.[chain] || 0;

            return (
              <div
                key={chain}
                className="card"
                style={{
                  background: "var(--bg-surface-container)",
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr",
                  alignItems: "center",
                  padding: "var(--spacing-4)",
                }}
              >
                <style>{`
                  @media (max-width: 768px) {
                    .assets-table-row-${chain} {
                      grid-template-columns: 1fr !important;
                    }
                    .assets-table-row-${chain} > div:nth-child(2),
                    .assets-table-row-${chain} > div:nth-child(3),
                    .assets-table-row-${chain} > div:nth-child(4) {
                      display: none !important;
                    }
                    .assets-mobile-${chain} {
                      display: grid !important;
                      grid-template-columns: 1fr 1fr;
                      gap: var(--spacing-3);
                      margin-top: var(--spacing-3);
                    }
                  }
                `}</style>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius-lg)",
                      background: "var(--primary-container)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      color: "var(--primary)",
                    }}
                  >
                    {asset.symbol.charAt(0)}
                  </div>
                  <div>
                    <p
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      {asset.symbol}
                    </p>
                    <p
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "0.6875rem",
                        color: "var(--text-muted)",
                        margin: 0,
                      }}
                    >
                      {chain.charAt(0).toUpperCase() + chain.slice(1)}
                    </p>
                    {/* Mobile-friendly data display */}
                    <div
                      style={{
                        display: "none",
                        marginTop: "var(--spacing-3)",
                        paddingTop: "var(--spacing-3)",
                        borderTop: "1px solid var(--ghost-border)",
                        fontSize: "0.75rem",
                      }}
                      className={`assets-mobile-data-${chain}`}
                    >
                      <div>
                        <p style={{ color: "var(--text-muted)", margin: "0 0 0.25rem 0" }}>Balance</p>
                        <p style={{ color: "var(--text-primary)", fontWeight: 600, margin: 0 }}>
                          {asset.balance.toFixed(8)}
                        </p>
                      </div>
                      <div>
                        <p style={{ color: "var(--text-muted)", margin: "0 0 0.25rem 0" }}>Price</p>
                        <p style={{ color: "var(--text-primary)", fontWeight: 600, margin: 0 }}>
                          ${rate.toLocaleString()}
                        </p>
                      </div>
                      <div style={{ gridColumn: "1 / -1" }}>
                        <p style={{ color: "var(--text-muted)", margin: "0 0 0.25rem 0" }}>Total Value</p>
                        <p style={{ color: "var(--text-primary)", fontWeight: 600, margin: 0 }}>
                          ${usdValue.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>
                    <style>{`
                      @media (max-width: 768px) {
                        .assets-mobile-data-${chain} {
                          display: grid !important;
                          grid-template-columns: 1fr 1fr;
                          gap: var(--spacing-2);
                        }
                      }
                    `}</style>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.8125rem",
                      color: "var(--text-primary)",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    {asset.balance.toFixed(8)}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    ${rate.toLocaleString()}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.8125rem",
                      color: "var(--text-primary)",
                      margin: 0,
                      fontWeight: 600,
                    }}
                  >
                    ${usdValue.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "var(--spacing-6)",
            padding: "var(--spacing-4)",
            background: "rgba(200, 200, 200, 0.05)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-label)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          💡 <strong>Tip:</strong> Exchange rates are approximate. For accurate valuations,
          integrate CoinGecko or Coingral APIs.
        </div>
      </div>
    </DashboardLayout>
  );
}
