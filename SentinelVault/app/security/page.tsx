"use client";

import DashboardLayout from "../components/DashboardLayout";

export default function SecurityPage() {
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
          Security
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            marginBottom: "var(--spacing-8)",
          }}
        >
          Best practices for keeping your wallet secure.
        </p>

        {/* Security best practices */}
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
            Security Checklist
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
            {[
              "✓ Never share your private keys or mnemonic seed",
              "✓ Use unique, strong passwords for each wallet",
              "✓ Enable two-factor authentication if available",
              "✓ Verify addresses before sending large amounts",
              "✓ Keep your recovery seed in a secure location",
              "✓ Use hardware wallets for large holdings",
              "✓ Be cautious of phishing links and fake websites",
              "✓ Keep your device software and apps updated",
            ].map((item, i) => (
              <p
                key={i}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {item}
              </p>
            ))}
          </div>
        </div>

        {/* Advanced Security Info */}
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
            Future Security Features
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
            Advanced security features like multi-signature wallets, hardware wallet integration, and cold storage protocols are planned for future releases.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
