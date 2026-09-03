"use client";

import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { getTransactions } from "../../lib/api";
import { isValidAddress } from "../../lib/validators";

const CHAINS = ["ethereum", "bitcoin", "solana"] as const;

export default function TransactionsPage() {
  const [selectedChain, setSelectedChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFetchTransactions = async () => {
    const addr = address.trim();

    if (!addr) {
      setError("Address cannot be empty");
      return;
    }

    const validation = isValidAddress(addr, selectedChain);
    if (!validation.valid) {
      setError(validation.error || "Invalid address");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const data = await getTransactions(selectedChain, addr);
      const txs = Array.isArray(data.normal) ? data.normal : [];
      // List all transactions (removed slice limitation)
      setTransactions(txs);
    } catch (e: any) {
      setError(e.message || "Failed to fetch transactions");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr: string) => {
    if (!addr || addr === "Unknown") return "Unknown";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const parseTxData = (tx: any, chain: string, currentAddress: string) => {
    let hash = tx.hash || tx.txid || tx.transaction?.signatures?.[0] || "";
    let timestamp = tx.timeStamp || tx.blockTime || tx.time || tx.timeFirstSeen || Math.floor(Date.now() / 1000);
    
    // Attempt standard parsing for statuses or fallback to confirmed
    let status = tx.status || (tx.txreceipt_status === "0" ? "failed" : "confirmed");
    if (String(status).toLowerCase() === "error") status = "failed";

    let from = tx.from || "Unknown";
    let to = tx.to || "Unknown";
    let valueStr = "-";
    let type: "sent" | "received" | "unknown" = "unknown";
    let extra = "Transaction";

    const addrLower = currentAddress.toLowerCase();

    if (chain === "ethereum") {
      const isSender = tx.from?.toLowerCase() === addrLower;
      const isReceiver = tx.to?.toLowerCase() === addrLower;
      
      const val = Number(tx.value || 0) / 1e18;
      valueStr = val > 0 ? `${val.toFixed(5)} ETH` : "0 ETH";
      
      if (isSender && val > 0) {
        type = "sent";
        extra = "Sent ETH";
      } else if (isReceiver && val > 0) {
        type = "received";
        extra = "Received ETH";
      } else {
        type = "unknown";
        extra = val === 0 ? "Contract Call" : "Internal Tx";
      }
    } else if (chain === "bitcoin") {
      const isSender = tx.from?.toLowerCase() === addrLower;
      
      const val = Number(tx.value || 0) / 1e8;
      valueStr = val > 0 ? `${val.toFixed(5)} BTC` : "0 BTC";
      
      if (isSender) {
        type = "sent";
        extra = "Sent BTC";
      } else {
        type = "received";
        extra = "Received BTC";
      }
      
      from = tx.from || "Unknown";
      to = tx.to || "Unknown";
      
      // Override common fields using the unified proxy payload
      hash = tx.hash || hash;
      timestamp = tx.timeStamp ? Number(tx.timeStamp) : timestamp;
      status = Number(tx.confirmations || 0) > 0 ? "confirmed" : "pending";
    }

    return { hash, timestamp, status, from, to, valueStr, type, extra };
  };

  const getExplorerUrl = (hash: string): string => {
    const hash_lower = hash.toLowerCase();
    if (selectedChain === "ethereum") {
      return `https://etherscan.io/tx/${hash_lower}`;
    } else if (selectedChain === "bitcoin") {
      return `https://mempool.space/tx/${hash_lower}`;
    } else if (selectedChain === "solana") {
      return `https://solscan.io/tx/${hash_lower}`;
    }
    return "#";
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1000, margin: "0 auto", paddingBottom: "var(--spacing-8)" }} className="animate-fade-in">
        <h1
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "2rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: "var(--spacing-2)",
          }}
        >
          Transactions
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.9375rem",
            color: "var(--text-muted)",
            marginBottom: "var(--spacing-6)",
          }}
        >
          View the complete and detailed history of your wallet's activities.
        </p>

        {/* Input Section */}
        <div
          className="card card-elevated"
          style={{
            marginBottom: "var(--spacing-8)",
            padding: "var(--spacing-6)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--spacing-4)", flexWrap: "wrap", marginBottom: "var(--spacing-6)" }}>
            <div style={{ flex: "0 1 200px" }}>
              <label
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  display: "block",
                  marginBottom: "var(--spacing-2)",
                  fontWeight: 600,
                }}
              >
                Blockchain
              </label>
              <select
                value={selectedChain}
                onChange={(e) => {
                  setSelectedChain(e.target.value);
                  setTransactions([]);
                  setError("");
                }}
                style={{ width: "100%", padding: "0.875rem 1rem", fontSize: "0.9375rem" }}
              >
                {CHAINS.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain.charAt(0).toUpperCase() + chain.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "1 1 300px" }}>
              <label
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.6875rem",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  display: "block",
                  marginBottom: "var(--spacing-2)",
                  fontWeight: 600,
                }}
              >
                Wallet Address
              </label>
              <input
                type="text"
                placeholder="Enter wallet address..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                style={{ width: "100%", padding: "0.875rem 1rem", fontSize: "0.9375rem" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleFetchTransactions();
                }}
              />
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={handleFetchTransactions}
            disabled={loading || !address.trim()}
            style={{ width: "100%", padding: "1rem", fontSize: "1rem" }}
          >
            {loading ? "Scanning Network..." : "Explore Transactions"}
          </button>

          {error && (
            <div
              style={{
                marginTop: "var(--spacing-4)",
                background: "rgba(255, 56, 56, 0.1)",
                color: "var(--error)",
                padding: "var(--spacing-3) var(--spacing-4)",
                borderRadius: "var(--radius-lg)",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                borderLeft: "4px solid var(--error)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Transactions List */}
        {transactions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-2)" }}>
              <h3
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {transactions.length} Records Discovered
              </h3>
            </div>

            {transactions.map((tx, idx) => {
              const pTx = parseTxData(tx, selectedChain, address);

              const isErrorStatus = pTx.status.toLowerCase() === "failed";
              const typeColor = 
                pTx.type === "received" ? "var(--tertiary)" :
                pTx.type === "sent" ? "var(--error)" :
                "var(--text-primary)";
              
              const typeBg = 
                pTx.type === "received" ? "var(--tertiary-container)" :
                pTx.type === "sent" ? "var(--error-container)" :
                "var(--bg-surface-highest)";

              const typeIcon = 
                pTx.type === "received" ? "south_west" :
                pTx.type === "sent" ? "north_east" :
                "swap_horiz";

              const sign = pTx.type === "received" ? "+" : (pTx.type === "sent" ? "-" : "");

              return (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: "var(--spacing-4)",
                    display: "flex",
                    gap: "var(--spacing-4)",
                    alignItems: "center",
                    border: "1px solid var(--ghost-border)",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.borderColor = "var(--outline-variant)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.borderColor = "var(--ghost-border)";
                  }}
                  onClick={() => window.open(getExplorerUrl(pTx.hash), "_blank")}
                >
                  {/* Icon */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: typeBg,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 24,
                        color: typeColor,
                        opacity: 0.9,
                      }}
                    >
                      {typeIcon}
                    </span>
                  </div>

                  {/* Main Details */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
                      <p
                        style={{
                          fontFamily: "var(--font-headline)",
                          fontSize: "1.0625rem",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        {pTx.extra}
                      </p>
                      
                      <span
                        style={{
                          fontFamily: "var(--font-label)",
                          fontSize: "0.625rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "var(--radius-sm)",
                          background: isErrorStatus ? "var(--error-container)" : "var(--primary-container)",
                          color: isErrorStatus ? "var(--error)" : "var(--primary)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {pTx.status}
                      </span>
                    </div>

                    <p
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "0.8125rem",
                        color: "var(--text-muted)",
                        margin: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      <strong style={{ color: "var(--text-secondary)", fontWeight: 500 }}>From:</strong> {formatAddress(pTx.from)} &nbsp; • &nbsp; 
                      <strong style={{ color: "var(--text-secondary)", fontWeight: 500 }}>To:</strong> {formatAddress(pTx.to)}
                    </p>

                    <p
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        margin: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginTop: "0.125rem"
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        schedule
                      </span>
                      {pTx.timestamp ? new Date(pTx.timestamp * 1000).toLocaleString() : "Date unknown"}
                    </p>
                  </div>

                  {/* Value */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p
                      style={{
                        fontFamily: "var(--font-label)",
                        fontSize: "1.125rem",
                        fontWeight: 700,
                        color: typeColor,
                        margin: 0,
                      }}
                    >
                      {sign}{pTx.valueStr}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {transactions.length === 0 && !loading && !error && (
          <div
            className="card"
            style={{
              textAlign: "center",
              padding: "var(--spacing-12) var(--spacing-4)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              border: "1px dashed var(--ghost-border)",
              background: "transparent"
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--outline)", marginBottom: "var(--spacing-4)", opacity: 0.5 }}>
              manage_search
            </span>
            <p style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 var(--spacing-2)" }}>
              Ready to Explore
            </p>
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>
              Enter a wallet address above and click Explore Transactions.
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
