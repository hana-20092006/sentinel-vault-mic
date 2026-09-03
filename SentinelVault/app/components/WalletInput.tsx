"use client";

import { useState } from "react";

export default function WalletInput({ onSubmit, loading }: any) {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("ethereum");

  return (
    <div
      className="card"
      style={{
        background: "var(--bg-surface-container)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-headline)",
          fontSize: "0.9375rem",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
          marginBottom: "var(--spacing-4)",
        }}
      >
        Load Wallet
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
        <div style={{ display: "flex", gap: "var(--spacing-3)" }}>
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            style={{
              background: "var(--bg-surface-lowest)",
              border: "1px solid var(--ghost-border)",
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-label)",
              fontSize: "0.8125rem",
              cursor: "pointer",
              minWidth: 140,
            }}
          >
            <option value="ethereum">⟠ Ethereum</option>
            <option value="bitcoin">₿ Bitcoin</option>
            <option value="solana">◎ Solana</option>
          </select>

          <input
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
            placeholder="Enter wallet address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <button
          onClick={() => onSubmit(chain, address)}
          className="btn-primary"
          style={{ alignSelf: "flex-start" }}
          disabled={loading || !address.trim()}
        >
          {loading ? "Loading..." : "Load Wallet"}
        </button>
      </div>
    </div>
  );
}