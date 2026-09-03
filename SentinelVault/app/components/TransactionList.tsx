"use client";

import { useState } from "react";

export default function TransactionList({ txs, chain, address }: any) {
  const [tab, setTab] = useState("normal");
  const rawData = txs?.[tab] || [];

  const data = rawData.filter((tx: any) => {
    if (chain !== "bitcoin") return true;
    return (tx.from?.toLowerCase() === address.toLowerCase() || tx.to?.toLowerCase() === address.toLowerCase());
  });

  // Take only latest 4 for the compact card
  const recentData = data.slice(0, 4);

  return (
    <div className="card" style={{ background: "var(--bg-surface-container)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--spacing-4)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Recent Activity
        </h3>
        <button
          className="btn-ghost"
          style={{ fontSize: "0.6875rem", color: "var(--primary)", padding: 0 }}
        >
          View All
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "var(--spacing-2)", marginBottom: "var(--spacing-4)" }}>
        <TabButton label="Normal" value="normal" tab={tab} setTab={setTab} />
        {chain === "ethereum" && (
          <>
            <TabButton label="Internal" value="internal" tab={tab} setTab={setTab} />
            <TabButton label="Tokens" value="tokens" tab={tab} setTab={setTab} />
          </>
        )}
      </div>

      {/* Transaction rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
        {recentData.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", fontFamily: "var(--font-body)", margin: 0 }}>
            No transactions found
          </p>
        ) : (
          recentData.map((tx: any, i: number) => {
            const parsed = parseTx(tx, chain, tab, address);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-3)",
                  padding: "var(--spacing-3)",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-surface-low)",
                  transition: "background 0.15s ease",
                }}
              >
                {/* Status icon */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: parsed.type === "received"
                      ? "var(--tertiary-container)"
                      : "var(--error-container)",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 16,
                      color: parsed.type === "received" ? "var(--tertiary)" : "var(--error)",
                    }}
                  >
                    {parsed.type === "received" ? "check_circle" : "arrow_outward"}
                  </span>
                </div>

                {/* Info column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {parsed.extra}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    {parsed.hash?.slice(0, 10)}...
                  </p>
                </div>

                {/* Amount */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-label)",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: parsed.type === "received" ? "var(--tertiary)" : "var(--error)",
                      margin: 0,
                    }}
                  >
                    {parsed.type === "received" ? "+" : "-"}{parsed.value}
                  </p>
                  <span
                    className="chip"
                    style={{
                      fontSize: "0.5625rem",
                      padding: "0.125rem 0.375rem",
                      color: parsed.type === "received" ? "var(--tertiary)" : "var(--error)",
                      marginTop: 2,
                    }}
                  >
                    {parsed.extra}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── Tab Button ── */
function TabButton({ label, value, tab, setTab }: any) {
  const isActive = tab === value;
  return (
    <button
      onClick={() => setTab(value)}
      style={{
        padding: "0.375rem 0.75rem",
        borderRadius: "var(--radius-md)",
        border: "none",
        cursor: "pointer",
        fontFamily: "var(--font-label)",
        fontSize: "0.75rem",
        fontWeight: isActive ? 600 : 400,
        background: isActive ? "var(--primary)" : "var(--bg-surface-highest)",
        color: isActive ? "var(--bg-base)" : "var(--text-muted)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

/* ── TX Parser ── */
function parseTx(tx: any, chain: string, type: string, address: string) {
  if (chain === "ethereum" && type === "normal") {
    const isSender = tx.from?.toLowerCase() === address.toLowerCase();
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: `${(Number(tx.value) / 1e18).toFixed(5)} ETH`,
      extra: isSender ? "Sent" : "Received",
      type: isSender ? "sent" : "received",
    };
  }

  if (chain === "ethereum" && type === "tokens") {
    const isSender = tx.from?.toLowerCase() === address.toLowerCase();
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: `${tx.value / 10 ** tx.tokenDecimal} ${tx.tokenSymbol}`,
      extra: "Token Transfer",
      type: isSender ? "sent" : "received",
    };
  }

  if (chain === "ethereum" && type === "internal") {
    const isSender = tx.from?.toLowerCase() === address.toLowerCase();
    return {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      value: `${(Number(tx.value) / 1e18).toFixed(5)} ETH`,
      extra: "Internal Tx",
      type: isSender ? "sent" : "received",
    };
  }

  if (chain === "bitcoin") {
    const isSender = tx.from?.toLowerCase() === address.toLowerCase();

    return {
      hash: tx.hash || "",
      from: tx.from || "Unknown",
      to: tx.to || "Unknown",
      value: `${(Number(tx.value || 0) / 1e8).toFixed(5)} BTC`,
      extra: isSender ? "Sent" : "Received",
      type: isSender ? "sent" : "received",
    };
  }

  return {
    hash: tx.hash || tx.signature,
    from: "N/A",
    to: "N/A",
    value: "-",
    extra: "",
    type: "received" as const,
  };
}