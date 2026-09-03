"use client";

import DashboardLayout from "../components/DashboardLayout";

export default function NodesPage() {
  return (
    <DashboardLayout>
      <div style={{ maxWidth: 900 }}>
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
          Blockchain Nodes
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginBottom: "var(--spacing-8)",
          }}
        >
          Information about blockchain nodes and network status.
        </p>

        {/* Node Information */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface-container)",
            marginBottom: "var(--spacing-6)",
            padding: "var(--spacing-6)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 var(--spacing-4) 0",
            }}
          >
            Supported Networks
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
            {[
              { name: "Bitcoin", icon: "₿", description: "Using Blockstream and Mempool.space APIs for transaction data" },
              { name: "Ethereum", icon: "⟠", description: "Using Etherscan API and public RPC endpoints" },
              { name: "Solana", icon: "◎", description: "Using Solana RPC endpoints for on-chain data" },
            ].map((network) => (
              <div
                key={network.name}
                style={{
                  padding: "var(--spacing-3)",
                  borderRadius: "var(--radius-lg)",
                  background: "var(--bg-surface-lowest)",
                  display: "flex",
                  gap: "var(--spacing-3)",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "var(--bg-surface-container)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                  }}
                >
                  {network.icon}
                </div>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-headline)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    {network.name}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      margin: "var(--spacing-1) 0 0",
                    }}
                  >
                    {network.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coming Features */}
        <div
          className="card"
          style={{
            background: "var(--bg-surface-container)",
            padding: "var(--spacing-6)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 var(--spacing-3) 0",
            }}
          >
            Future Node Features
          </h3>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            Direct node monitoring, peer connection statistics, and real-time block synchronization tracking will be available when you configure private node endpoints.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
