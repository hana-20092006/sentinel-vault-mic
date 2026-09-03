"use client";

import { useState, useEffect } from "react";
import { getExchangeRates, type ExchangeRates } from "../../lib/rates";

const UNIT: Record<string, string> = {
  ethereum: "ETH",
  bitcoin: "BTC",
  solana: "SOL",
};

const CHAIN_ICON: Record<string, string> = {
  ethereum: "⟠",
  bitcoin: "₿",
  solana: "◎",
};

export default function WalletInfo({ address, balance, txCount, chain }: any) {
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [usd, setUsd] = useState("0.00");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return; // Don't poll rates if no wallet is loaded

    const loadRates = async () => {
      const liveRates = await getExchangeRates();
      setRates(liveRates);

      const rate = liveRates[chain as keyof ExchangeRates] || 0;
      const usdValue = (balance * rate).toFixed(2);
      setUsd(usdValue);
    };

    loadRates();
    const interval = setInterval(loadRates, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [address, balance, chain]);

  if (!address) return null;

  const unit = UNIT[chain] ?? "";
  const formatted =
    typeof balance === "number" ? balance.toFixed(8) : String(balance);

  return (
    <div
      className="card"
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-surface-container)",
      }}
    >
      {/* Background watermark */}
      <div
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          fontSize: "8rem",
          fontFamily: "var(--font-headline)",
          fontWeight: 800,
          color: "rgba(0, 218, 243, 0.04)",
          lineHeight: 1,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {CHAIN_ICON[chain] ?? "◇"}
      </div>

      {/* Label */}
      <p
        style={{
          fontFamily: "var(--font-label)",
          fontSize: "0.6875rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          margin: 0,
          marginBottom: "var(--spacing-2)",
        }}
      >
        Total Balance
      </p>

      {/* Balance number */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-2)", marginBottom: "var(--spacing-1)", flexWrap: "wrap", wordBreak: "break-word" }}>
        <span
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "clamp(2rem, 8vw, 2.5rem)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          {formatted}
        </span>
        <span
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "clamp(1rem, 4vw, 1.25rem)",
            fontWeight: 700,
            color: "var(--primary)",
          }}
        >
          {unit}
        </span>
      </div>

      {/* USD estimate */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", marginBottom: "var(--spacing-6)" }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: "0.8125rem", color: "var(--tertiary)" }}>
          ≈ ${usd} USD {rates ? "(live)" : "(loading...)"}
        </span>
      </div>

      {/* Address + Chain chips */}
      <div style={{ display: "flex", gap: "var(--spacing-3)", flexWrap: "wrap" }}>
        <div className="chip">
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.6875rem", fontWeight: 600 }}>Wallet Address</span>
          <span
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.6875rem",
              color: "var(--text-secondary)",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {address.slice(0, 8)}...{address.slice(-4)}
          </span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 14, color: copied ? "var(--tertiary)" : "var(--primary)", cursor: "pointer", transition: "color 0.2s ease" }}
            onClick={() => {
              navigator.clipboard.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            title="Copy address"
          >
            {copied ? "check" : "content_copy"}
          </span>
        </div>

        <div className="chip">
          <span style={{ fontFamily: "var(--font-label)", fontSize: "0.6875rem", fontWeight: 600 }}>Selected Chain</span>
          <span style={{ fontSize: "0.875rem" }}>{CHAIN_ICON[chain]}</span>
          <span
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.6875rem",
              color: "var(--primary)",
              textTransform: "capitalize",
            }}
          >
            {chain} Network
          </span>
        </div>
      </div>
    </div>
  );
}
