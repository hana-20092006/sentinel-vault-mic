"use client";

import { useState, useEffect } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { chains } from "../../lib/chains";
import { encodeQR } from "../../lib/qr";
import { estimateFees, FeeEstimate } from "../../lib/feeEstimate";
import type { FeeSpeed } from "../../lib/env";

interface Props {
  chain: string;
  sender?: string;
  chainLocked?: boolean;
}

interface TransactionRiskAnalysis {
  transaction: {
    sender: string;
    recipient: string;
    amount_eth: number;
  };
  combined_risk: {
    risk_score: number;
    risk_level: "low" | "medium" | "high" | "unknown";
    recommendation: "safe" | "caution" | "risky" | "unknown";
  };
  chainlink?: {
    transaction_hash: string;
    logging_expected: boolean;
    logged?: boolean;
    verified?: boolean;
  };
  sender_risk: {
    address: string;
    risk_score: number;
    risk_level: string;
    is_fraud: boolean;
    confidence: number;
    probabilities: {
      legitimate: number;
      fraud: number;
    };
  };
  recipient_risk: {
    address: string;
    risk_score: number;
    risk_level: string;
    is_fraud: boolean;
    confidence: number;
    probabilities: {
      legitimate: number;
      fraud: number;
    };
  };
}

interface ChainlinkStatus {
  state: "idle" | "pending" | "logged" | "failed";
  transactionHash: string | null;
  verified: boolean;
  message: string;
}

const SPEED_OPTIONS: FeeSpeed[] = ["slow", "normal", "fast"];
const SPEED_LABELS: Record<FeeSpeed, string> = {
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
};
const HIGH_RISK_THRESHOLD = 70;
const BLOCKING_RISK_THRESHOLD = 90;

export default function CreateTransaction({ chain: parentChain, sender, chainLocked = false }: Props) {
  const [chain, setChain] = useState(parentChain || "ethereum");
  const [from, setFrom] = useState(sender || "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [speed, setSpeed] = useState<FeeSpeed>("normal");
  const [feeEstimate, setFeeEstimate] = useState<FeeEstimate | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const [riskAnalysis, setRiskAnalysis] = useState<TransactionRiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showRiskWarning, setShowRiskWarning] = useState(false);
  const [showHighRiskModal, setShowHighRiskModal] = useState(false);
  const [chainlinkStatus, setChainlinkStatus] = useState<ChainlinkStatus>({
    state: "idle",
    transactionHash: null,
    verified: false,
    message: "",
  });

  // Update from address and chain when props change
  useEffect(() => {
    if (sender) {
      setFrom(sender);
    }
  }, [sender]);

  useEffect(() => {
    if (parentChain) {
      setChain(parentChain);
    }
  }, [parentChain]);

  const amountPlaceholder =
    chain === "bitcoin"
      ? "Amount (BTC)"
      : chain === "solana"
      ? "Amount (SOL)"
      : "Amount (ETH)";

  // Convert amount to ETH for risk analysis (use current amount regardless of chain)
  const getAmountInEth = (): number => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) return 0;
    
    // For simplicity, use the amount directly as ETH equivalent
    // In production, you'd want real conversion rates
    return amountNum;
  };

  const analyzeTransactionRisk = async (): Promise<TransactionRiskAnalysis | null> => {
    if (!from || !to || !amount) return null;
    
    setRiskLoading(true);
    try {
      const response = await fetch('/api/risk/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: from,
          recipient: to,
          amount_eth: getAmountInEth(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Risk analysis service is unavailable');
      }

      const data = await response.json();
      setRiskAnalysis(data);
      setShowRiskWarning((data.combined_risk?.risk_score || 0) >= HIGH_RISK_THRESHOLD);
      if ((data.combined_risk?.risk_score || 0) >= BLOCKING_RISK_THRESHOLD) {
        setShowHighRiskModal(true);
      }
      setChainlinkStatus({
        state: data.chainlink?.logged ? "logged" : data.chainlink?.transaction_hash ? "pending" : "idle",
        transactionHash: data.chainlink?.transaction_hash || null,
        verified: Boolean(data.chainlink?.verified),
        message: data.chainlink?.logged
          ? data.chainlink?.verified
            ? "Risk prediction logged through the Chainlink path."
            : "Risk prediction logged. Waiting for Chainlink verification."
          : data.chainlink?.transaction_hash
          ? "Risk prediction sent to the Chainlink logging path."
          : "",
      });
      return data;
    } catch (error) {
      console.error('Risk analysis failed:', error);
      setRiskAnalysis(null);
      setShowRiskWarning(false);
      setShowHighRiskModal(false);
      setChainlinkStatus({
        state: "failed",
        transactionHash: null,
        verified: false,
        message: "Chainlink logging path is unavailable.",
      });
      setError(error instanceof Error ? error.message : "Risk analysis failed");
    } finally {
      setRiskLoading(false);
    }
    
    return null;
  };

  // Load fee estimate when chain changes
  useEffect(() => {
    let isMounted = true;

    const loadFees = async () => {
      setFeeLoading(true);
      try {
        const estimate = await estimateFees(chain);
        if (isMounted) {
          setFeeEstimate(estimate);
        }
      } catch (e) {
        console.error("Failed to load fees:", e);
        if (isMounted) {
          setFeeEstimate(null);
        }
      } finally {
        if (isMounted) {
          setFeeLoading(false);
        }
      }
    };

    setQr("");
    setError("");
    loadFees();

    return () => {
      isMounted = false;
    };
  }, [chain]);

  // Auto-analyze risk when user fills in transaction details
  useEffect(() => {
    if (from && to && amount && parseFloat(amount) > 0) {
      setQr("");

      // Debounce risk analysis to avoid too many API calls
      const timeoutId = setTimeout(() => {
        analyzeTransactionRisk();
      }, 1000); // Wait 1 second after user stops typing

      return () => clearTimeout(timeoutId);
    } else {
      // Clear risk analysis if inputs are incomplete
      setRiskAnalysis(null);
      setShowRiskWarning(false);
      setShowHighRiskModal(false);
      setQr("");
      setChainlinkStatus({
        state: "idle",
        transactionHash: null,
        verified: false,
        message: "",
      });
    }
  }, [from, to, amount]);

  useEffect(() => {
    if (!chainlinkStatus.transactionHash || chainlinkStatus.state !== "pending") {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 6;

    const pollLogs = async () => {
      try {
        const response = await fetch(
          `/api/risk/logs?transaction_hash=${encodeURIComponent(chainlinkStatus.transactionHash || "")}&limit=20`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch Chainlink logs");
        }

        const data = await response.json();
        const log = data.logs?.[0];

        if (cancelled) {
          return;
        }

        if (log) {
          setChainlinkStatus({
            state: "logged",
            transactionHash: log.transaction_hash,
            verified: Boolean(log.verified),
            message: log.verified
              ? "Risk prediction logged through the Chainlink path."
              : "Risk prediction logged. Waiting for Chainlink verification.",
          });
          return;
        }

        attempt += 1;
        if (attempt >= maxAttempts) {
          setChainlinkStatus((current) => ({
            ...current,
            state: "failed",
            verified: false,
            message: "Risk prediction completed, but no Chainlink log was confirmed yet.",
          }));
          return;
        }

        setTimeout(pollLogs, 1000);
      } catch (_error) {
        if (!cancelled) {
          setChainlinkStatus((current) => ({
            ...current,
            state: "failed",
            verified: false,
            message: "Unable to confirm Chainlink logging.",
          }));
        }
      }
    };

    const timer = setTimeout(pollLogs, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chainlinkStatus.transactionHash, chainlinkStatus.state]);

  const buildQrTransaction = async (riskData: TransactionRiskAnalysis) => {
    const payload = await (chains as any)[chain].buildTx({
      from,
      to,
      amount,
      speed,
    });

    const qrData = {
      chain,
      payload,
      riskAnalysis: {
        riskScore: riskData.combined_risk.risk_score,
        riskLevel: riskData.combined_risk.risk_level,
        recommendation: riskData.combined_risk.recommendation,
        timestamp: new Date().toISOString(),
      },
    };

    setQr(encodeQR(qrData));
  };

  const handleGenerate = async () => {
    // Validate input
    if (!from || !to || !amount) {
      setError("Please fill in all required fields");
      setQr("");
      return;
    }

    if (parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      setQr("");
      return;
    }

    setError("");
    setQr("");
    setLoading(true);

    try {
      const riskData = await analyzeTransactionRisk();
      if (!riskData) {
        setError("Risk analysis must complete before generating a QR code.");
        return;
      }

      if ((riskData.combined_risk?.risk_score || 0) >= BLOCKING_RISK_THRESHOLD) {
        setShowHighRiskModal(true);
        return;
      }

      await buildQrTransaction(riskData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to build transaction");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAnyway = async () => {
    if (!riskAnalysis) {
      return;
    }

    setShowHighRiskModal(false);
    setLoading(true);
    setError("");

    try {
      await buildQrTransaction(riskAnalysis);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to build transaction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        background: "var(--bg-surface-container)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--spacing-4)",
      }}
    >
      {/* Divider accent line */}
      <div
        style={{
          width: "100%",
          height: 2,
          background: "linear-gradient(90deg, var(--primary) 0%, transparent 100%)",
          borderRadius: 1,
          marginBottom: "var(--spacing-2)",
        }}
      />

      <h2
        style={{
          fontFamily: "var(--font-headline)",
          fontSize: "1.125rem",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        🛡️ Secure Transfer Initiation
      </h2>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          margin: "var(--spacing-2) 0 0 0",
        }}
      >
        AI-powered risk analysis is automatically performed for all transfers
      </p>

      {/* Chain selector */}
      <div>
        <label
          htmlFor="tx-chain"
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
          Blockchain
        </label>
        <div style={{ position: "relative" }}>
          <select
            id="tx-chain"
            name="chain"
            value={chain}
            onChange={(e) => !chainLocked && setChain(e.target.value)}
            disabled={chainLocked}
            style={{
              width: "100%",
              background: chainLocked ? "var(--bg-surface)" : "var(--bg-surface-lowest)",
              border: `1px solid ${chainLocked ? "var(--primary)" : "var(--ghost-border)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-label)",
              fontSize: "0.8125rem",
              cursor: chainLocked ? "not-allowed" : "pointer",
              opacity: chainLocked ? 0.75 : 1,
            }}
          >
            {Object.entries(chains).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          {chainLocked && (
            <span
              className="material-symbols-outlined"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 16,
                color: "var(--primary)",
                pointerEvents: "none",
              }}
            >
              lock
            </span>
          )}
        </div>
      </div>

      {/* Recipient */}
      <div>
        <label
          htmlFor="tx-recipient-address"
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
          Recipient Address
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="tx-recipient-address"
            name="recipient-address"
            placeholder="Enter address..."
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-lowest)",
              border: "1px solid var(--ghost-border)",
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              paddingRight: "2.5rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-label)",
              fontSize: "0.8125rem",
            }}
          />
          {to && (
            <button
              onClick={() => setTo("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: "var(--text-muted)" }}
              >
                close
              </span>
            </button>
          )}
        </div>
      </div>

      {/* From address */}
      <div>
        <label
          htmlFor="tx-from-address"
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
          From Address
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="tx-from-address"
            name="from-address"
            placeholder="Enter your address..."
            value={from}
            onChange={(e) => !chainLocked && setFrom(e.target.value)}
            readOnly={chainLocked}
            style={{
              width: "100%",
              background: chainLocked ? "var(--bg-surface)" : "var(--bg-surface-lowest)",
              border: `1px solid ${chainLocked ? "var(--primary)" : "var(--ghost-border)"}`,
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              paddingRight: chainLocked ? "2.5rem" : "1rem",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--text-primary)",
              cursor: chainLocked ? "not-allowed" : "text",
              opacity: chainLocked ? 0.75 : 1,
            }}
          />
          {chainLocked && (
            <span
              className="material-symbols-outlined"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 16,
                color: "var(--primary)",
                pointerEvents: "none",
              }}
            >
              lock
            </span>
          )}
        </div>
      </div>

      {/* Amount + Speed */}
      <div style={{ display: "flex", gap: "var(--spacing-3)", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label
            htmlFor="tx-amount"
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
            {amountPlaceholder}
          </label>
          <input
            id="tx-amount"
            name="amount"
            placeholder="0.00"
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-lowest)",
              border: "1px solid var(--ghost-border)",
              borderRadius: "var(--radius-lg)",
              padding: "0.625rem 1rem",
              color: "var(--text-primary)",
              fontFamily: "var(--font-label)",
              fontSize: "0.8125rem",
            }}
          />
        </div>

        <div>
          <label
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
            Speed
          </label>
          <div style={{ display: "flex", gap: 2 }}>
            {SPEED_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                disabled={feeLoading}
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  cursor: feeLoading ? "not-allowed" : "pointer",
                  fontFamily: "var(--font-label)",
                  fontSize: "0.75rem",
                  fontWeight: speed === s ? 600 : 400,
                  background:
                    speed === s
                      ? "var(--primary)"
                      : "var(--bg-surface-highest)",
                  color:
                    speed === s
                      ? "var(--bg-base)"
                      : "var(--text-muted)",
                  transition: "all 0.15s ease",
                  opacity: feeLoading ? 0.5 : 1,
                }}
              >
                {SPEED_LABELS[s]}
              </button>
            ))}
          </div>
          {feeEstimate && (
            <p
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.625rem",
                color: "var(--text-muted)",
                margin: "var(--spacing-1) 0 0",
              }}
            >
              Fee: {feeEstimate[speed]} {feeEstimate.unit}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(255, 56, 56, 0.1)",
            color: "var(--error)",
            padding: "var(--spacing-3)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
          }}
        >
          {error}
        </div>
      )}

      {showRiskWarning && riskAnalysis && (
        <div
          style={{
            background: "rgba(255, 56, 56, 0.08)",
            border: "1px solid rgba(255, 56, 56, 0.2)",
            color: "var(--error)",
            padding: "var(--spacing-3)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
          }}
        >
          High-risk transfer detected for this amount and address pair. Review the score before generating the QR code.
        </div>
      )}

      {chainlinkStatus.state !== "idle" && (
        <div
          style={{
            background:
              chainlinkStatus.state === "logged"
                ? "rgba(76, 175, 80, 0.1)"
                : chainlinkStatus.state === "pending"
                ? "rgba(33, 150, 243, 0.1)"
                : "rgba(255, 193, 7, 0.1)",
            color:
              chainlinkStatus.state === "logged"
                ? "var(--success)"
                : chainlinkStatus.state === "pending"
                ? "var(--primary)"
                : "var(--warning)",
            padding: "var(--spacing-3)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "var(--spacing-1)" }}>
            Chainlink Logging
          </div>
          <div>{chainlinkStatus.message}</div>
          {chainlinkStatus.transactionHash && (
            <div style={{ marginTop: "var(--spacing-1)", opacity: 0.8 }}>
              Tracking ID: {chainlinkStatus.transactionHash}
            </div>
          )}
        </div>
      )}

      {/* Risk Analysis Display */}
      {riskAnalysis && (
        <div
          style={{
            background: riskAnalysis.combined_risk?.risk_level === 'high' 
              ? "rgba(255, 56, 56, 0.1)" 
              : riskAnalysis.combined_risk?.risk_level === 'medium'
              ? "rgba(255, 193, 7, 0.1)"
              : "rgba(76, 175, 80, 0.1)",
            color: riskAnalysis.combined_risk?.risk_level === 'high'
              ? "var(--error)"
              : riskAnalysis.combined_risk?.risk_level === 'medium'
              ? "var(--warning)"
              : "var(--success)",
            padding: "var(--spacing-3)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "var(--spacing-2)" }}>
            🛡️ Risk Analysis
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-1)" }}>
            <span>Risk Score:</span>
            <span style={{ fontWeight: 600 }}>
              {riskAnalysis.combined_risk?.risk_score?.toFixed(1) || '0.0'}/100
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--spacing-1)" }}>
            <span>Risk Level:</span>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
              {riskAnalysis.combined_risk?.risk_level || 'unknown'}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Recommendation:</span>
            <span style={{ fontWeight: 600, textTransform: "capitalize" }}>
              {riskAnalysis.combined_risk?.recommendation || 'unknown'}
            </span>
          </div>
        </div>
      )}

      {/* Risk Loading Indicator */}
      {riskLoading && (
        <div
          style={{
            background: "rgba(33, 150, 243, 0.1)",
            color: "var(--primary)",
            padding: "var(--spacing-3)",
            borderRadius: "var(--radius-lg)",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
            textAlign: "center",
          }}
        >
          🔍 Analyzing transaction risk...
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{ display: "flex", gap: "var(--spacing-3)", flexWrap: "wrap" }}
      >
        <button
          onClick={handleGenerate}
          disabled={loading || feeLoading}
          className="btn-primary"
          style={{
            flex: "1 1 auto",
            opacity: loading || feeLoading ? 0.6 : 1,
            cursor: loading || feeLoading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Analyzing & Building..." : riskAnalysis ? `Generate QR (${riskAnalysis.combined_risk?.risk_level || 'unknown'} risk)` : "Generate QR"}
        </button>
      </div>

      {/* QR output */}
      {qr && (
        <div
          className="animate-fade-in"
          style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}
        >
          <div
            style={{
              background: "white",
              padding: "var(--spacing-6)",
              borderRadius: "var(--radius-xl)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <QRCodeCanvas value={qr} size={200} />
          </div>

          <div
            style={{
              background: "rgba(255, 180, 0, 0.08)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--spacing-3)",
            }}
          >
            <p
              style={{
                color: "#ffb400",
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                fontWeight: 600,
                margin: 0,
              }}
            >
              ⚠️ Unsigned Transaction
            </p>
            <p
              style={{
                color: "rgba(255, 180, 0, 0.6)",
                fontSize: "0.75rem",
                margin: "0.25rem 0 0",
              }}
            >
              Scan this QR on your air-gapped signer. Then use "Broadcast Signed
              Transaction" to submit it.
            </p>
          </div>

          <pre
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.6875rem",
              background: "var(--bg-surface-lowest)",
              color: "var(--text-muted)",
              padding: "var(--spacing-3)",
              borderRadius: "var(--radius-lg)",
              overflow: "auto",
              maxHeight: 100,
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {qr}
          </pre>
        </div>
      )}

      {showHighRiskModal && riskAnalysis && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 10, 18, 0.68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--spacing-4)",
            zIndex: 1000,
          }}
        >
          <div
            className="card"
            style={{
              width: "min(100%, 30rem)",
              background: "var(--bg-surface-container)",
              border: "1px solid rgba(255, 56, 56, 0.2)",
              boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: "var(--font-headline)",
                fontSize: "1rem",
                color: "var(--error)",
              }}
            >
              High Risk Transaction Warning
            </h3>
            <p
              style={{
                margin: "var(--spacing-3) 0",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
                color: "var(--text-primary)",
              }}
            >
              The Crypto ML analysis flagged this transfer as very high risk before QR generation.
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-label)",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
              }}
            >
              Score: {riskAnalysis.combined_risk.risk_score.toFixed(1)}/100
              {" · "}
              Level: {riskAnalysis.combined_risk.risk_level}
              {" · "}
              Recommendation: {riskAnalysis.combined_risk.recommendation}
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-3)",
                marginTop: "var(--spacing-5)",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setShowHighRiskModal(false)}
                style={{
                  flex: "1 1 10rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--ghost-border)",
                  background: "var(--bg-surface-lowest)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateAnyway}
                className="btn-primary"
                style={{
                  flex: "1 1 10rem",
                  background: "var(--error)",
                  color: "white",
                }}
              >
                Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
