"use client";

interface VaultStatusProps {
  address?: string;
}

export default function VaultStatus({ address }: VaultStatusProps) {
  const isConnected = !!address;

  return (
    <div
      className="card"
      style={{
        background: "var(--bg-surface-container)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle glow accent */}
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: isConnected ? "var(--primary-glow)" : "rgba(255, 180, 0, 0.15)",
          filter: "blur(30px)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-3)",
          marginBottom: "var(--spacing-4)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: isConnected ? "var(--tertiary-container)" : "rgba(255, 180, 0, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: isConnected ? "var(--tertiary)" : "#ffb400" }}
          >
            {isConnected ? "verified_user" : "shield"}
          </span>
        </div>
        <h3
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Wallet Status
        </h3>
      </div>

      {/* Description */}
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
          lineHeight: 1.6,
          margin: 0,
          marginBottom: "var(--spacing-4)",
        }}
      >
        {isConnected
          ? "Your wallet is ready for transactions. Always verify addresses before sending funds and never share your private keys."
          : "No wallet is currently loaded. Enter a wallet address above to view your balance, transaction history, and risk analysis."}
      </p>

      {/* Status chips */}
      <div style={{ display: "flex", gap: "var(--spacing-3)", flexWrap: "wrap" }}>
        <div className="chip">
          <span
            className={`status-dot ${isConnected ? "status-dot--success" : "status-dot--warning"}`}
            style={!isConnected ? { background: "#ffb400" } : undefined}
          />
          <span style={{ fontWeight: 500 }}>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        <div className="chip">
          <span
            className={`status-dot ${isConnected ? "status-dot--success" : "status-dot--warning"}`}
            style={!isConnected ? { background: "#ffb400" } : undefined}
          />
          <span style={{ fontWeight: 500 }}>{isConnected ? "Ready to Send" : "Not Ready"}</span>
        </div>
      </div>
    </div>
  );
}
