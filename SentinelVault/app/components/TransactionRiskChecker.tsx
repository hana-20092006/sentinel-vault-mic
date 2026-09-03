"use client";

import { useState, useEffect } from "react";
import { checkRiskAPIHealth } from "../../lib/risk";

interface TransactionRiskCheckerProps {
  sender?: string;
  recipient?: string;
  amount?: number;
}

interface RiskResult {
  address: string;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'unknown';
  is_fraud: boolean;
  confidence: number;
  probabilities: {
    legitimate: number;
    fraud: number;
  };
  transaction_count?: number;
  error?: string;
}

interface TransactionRiskResult {
  transaction: {
    sender: string;
    recipient: string;
    amount_eth: number;
  };
  sender_risk: RiskResult;
  recipient_risk: RiskResult;
  combined_risk: {
    risk_score: number;
    risk_level: 'low' | 'medium' | 'high';
    recommendation: 'safe' | 'caution' | 'risky';
  };
}

export default function TransactionRiskChecker({ sender, recipient, amount }: TransactionRiskCheckerProps) {
  const [manualSender, setManualSender] = useState(sender || '');
  const [manualRecipient, setManualRecipient] = useState(recipient || '');
  const [manualAmount, setManualAmount] = useState(amount?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransactionRiskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  // Update form when props change
  useEffect(() => {
    if (sender) setManualSender(sender);
    if (recipient) setManualRecipient(recipient);
    if (amount) setManualAmount(amount.toString());
  }, [sender, recipient, amount]);

  useEffect(() => {
    checkAPIHealth();
  }, []);

  useEffect(() => {
    if (sender && recipient && amount) {
      analyzeTransaction(sender, recipient, amount);
    }
  }, [sender, recipient, amount]);

  const checkAPIHealth = async () => {
    const health = await checkRiskAPIHealth();
    setApiHealthy(health.available && health.status === 'healthy' && health.model_loaded);
  };

  const analyzeTransaction = async (senderAddr: string, recipientAddr: string, amountEth: number) => {
    setLoading(true);
    setError(null);

    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch('/api/risk/transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: senderAddr,
          recipient: recipientAddr,
          amount_eth: amountEth,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Risk analysis failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Ensure the result has the expected structure
      const safeResult = {
        ...data,
        combined_risk: data.combined_risk || {
          risk_score: 0,
          risk_level: 'unknown',
          recommendation: 'unknown'
        },
        sender_risk: data.sender_risk || {
          address: senderAddr,
          risk_score: 0,
          risk_level: 'unknown',
          is_fraud: false,
          confidence: 0,
          probabilities: { legitimate: 0, fraud: 0 }
        },
        recipient_risk: data.recipient_risk || {
          address: recipientAddr,
          risk_score: 0,
          risk_level: 'unknown',
          is_fraud: false,
          confidence: 0,
          probabilities: { legitimate: 0, fraud: 0 }
        }
      };
      
      setResult(safeResult);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError('Request timed out. Please try again.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to analyze transaction risk');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualAnalysis = () => {
    // Clear previous error
    setError(null);
    
    // Trim whitespace from all inputs
    const cleanSender = manualSender.trim();
    const cleanRecipient = manualRecipient.trim();
    const cleanAmount = manualAmount.trim();

    if (!cleanSender || !cleanRecipient || !cleanAmount) {
      setError('Please fill in all fields');
      return;
    }

    // Basic address validation for different blockchains
    const isValidAddress = (address: string) => {
      // Ethereum addresses (0x...)
      if (address.startsWith('0x') && address.length === 42) {
        return true;
      }
      // Bitcoin addresses (1..., 3..., bc1...)
      if (address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')) {
        return true;
      }
      return false;
    };

    if (!isValidAddress(cleanSender) || !isValidAddress(cleanRecipient)) {
      setError('Please enter valid cryptocurrency addresses (Ethereum or Bitcoin)');
      return;
    }

    const amount = parseFloat(cleanAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }

    console.log('Analyzing transaction:', { cleanSender, cleanRecipient, amount });
    analyzeTransaction(cleanSender, cleanRecipient, amount);
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
      case 'safe':
        return 'var(--success)';
      case 'medium':
      case 'caution':
        return 'var(--warning)';
      case 'high':
      case 'risky':
        return 'var(--error)';
      default:
        return 'var(--text-muted)';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low':
      case 'safe':
        return '✅';
      case 'medium':
      case 'caution':
        return '⚠️';
      case 'high':
      case 'risky':
        return '🚨';
      default:
        return '❓';
    }
  };

  if (apiHealthy === false) {
    return (
      <div className="card" style={{ background: "var(--bg-surface-container)" }}>
        <h3
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 var(--spacing-4) 0",
          }}
        >
          Transaction Risk Checker
        </h3>
        <div
          style={{
            padding: "var(--spacing-4)",
            background: "var(--error-container)",
            borderRadius: "var(--radius-md)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--error)",
              margin: 0,
            }}
          >
            Risk analysis service is currently unavailable
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: "var(--bg-surface-container)" }}>
      <style>{`
        @media (max-width: 768px) {
          .risk-score-display {
            font-size: 1.5rem !important;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: "var(--spacing-6)" }}>
        <h3
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 var(--spacing-2) 0",
          }}
        >
          Transaction Risk Checker
        </h3>
        <p
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Analyze risk for both sender and recipient before making transactions
        </p>
      </div>

      {/* Manual Input Section */}
      <div
        style={{
          background: "var(--bg-surface-lowest)",
          padding: "var(--spacing-4)",
          borderRadius: "var(--radius-md)",
          marginBottom: "var(--spacing-6)",
        }}
      >
        <h4
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 var(--spacing-4) 0",
          }}
        >
          Check Transaction Risk
        </h4>

        <div style={{ display: "grid", gap: "var(--spacing-3)" }}>
          <div>
            <label
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Sender Address
            </label>
            <input
              type="text"
              value={manualSender}
              onChange={(e) => setManualSender(e.target.value)}
              placeholder="0x... or bc1..."
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                border: "1px solid var(--ghost-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Recipient Address
            </label>
            <input
              type="text"
              value={manualRecipient || recipient || ''}
              onChange={(e) => setManualRecipient(e.target.value)}
              placeholder="0x..."
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                border: "1px solid var(--ghost-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <div>
            <label
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                display: "block",
                marginBottom: "var(--spacing-1)",
              }}
            >
              Amount (ETH)
            </label>
            <input
              type="number"
              value={manualAmount || amount || ''}
              onChange={(e) => setManualAmount(e.target.value)}
              placeholder="1.5"
              step="0.001"
              style={{
                width: "100%",
                padding: "var(--spacing-2)",
                border: "1px solid var(--ghost-border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "0.875rem",
              }}
            />
          </div>

          <button
            onClick={handleManualAnalysis}
            disabled={loading}
            style={{
              padding: "var(--spacing-3)",
              background: loading ? "var(--ghost-border)" : "var(--primary)",
              color: loading ? "var(--text-muted)" : "var(--on-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 200ms ease",
            }}
          >
            {loading ? "Analyzing..." : "Check Transaction Risk"}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && !loading && (
        <div
          style={{
            padding: "var(--spacing-4)",
            background: "var(--error-container)",
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--spacing-4)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--error)",
              margin: 0,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--spacing-6)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid var(--ghost-border)",
              borderTop: "3px solid var(--primary)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto var(--spacing-4) auto",
            }}
          />
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            Analyzing transaction risk...
          </p>
        </div>
      )}

      {/* Results Display */}
      {result && !loading && !error && (
        <div>
          {/* Combined Risk */}
          <div
            style={{
              background: "var(--bg-surface-lowest)",
              padding: "var(--spacing-6)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
              marginBottom: "var(--spacing-6)",
            }}
          >
            <div style={{ marginBottom: "var(--spacing-4)" }}>
              <span className="risk-score-display" style={{
                fontFamily: "var(--font-headline)",
                fontSize: "2rem",
                fontWeight: 700,
                color: getRiskColor(result.combined_risk?.risk_level || 'unknown'),
              }}>
                {result.combined_risk?.risk_score?.toFixed(1) || '0.0'}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                  marginLeft: "var(--spacing-2)",
                }}
              >
                / 100
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--spacing-2)" }}>
              <span style={{ fontSize: "1.5rem" }}>{getRiskIcon(result.combined_risk?.recommendation || 'unknown')}</span>
              <span
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: getRiskColor(result.combined_risk?.recommendation || 'unknown'),
                  textTransform: "capitalize",
                }}
              >
                {result.combined_risk?.recommendation || 'unknown'}
              </span>
            </div>
          </div>

          {/* Individual Risk Analysis */}
          <div style={{ display: "grid", gap: "var(--spacing-4)" }}>
            {/* Sender Risk */}
            <div
              style={{
                background: "var(--bg-surface-lowest)",
                padding: "var(--spacing-4)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginBottom: "var(--spacing-2)",
                }}
              >
                Sender Risk
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
                  {result.sender_risk?.address ? `${result.sender_risk.address.slice(0, 10)}...${result.sender_risk.address.slice(-8)}` : 'N/A'}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: getRiskColor(result.sender_risk?.risk_level || 'unknown'),
                  }}
                >
                  {result.sender_risk?.risk_score?.toFixed(1) || '0.0'} ({result.sender_risk?.risk_level || 'unknown'})
                </span>
              </div>
            </div>

            {/* Recipient Risk */}
            <div
              style={{
                background: "var(--bg-surface-lowest)",
                padding: "var(--spacing-4)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-label)",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginBottom: "var(--spacing-2)",
                }}
              >
                Recipient Risk
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
                  {result.recipient_risk?.address ? `${result.recipient_risk.address.slice(0, 10)}...${result.recipient_risk.address.slice(-8)}` : 'N/A'}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: getRiskColor(result.recipient_risk?.risk_level || 'unknown'),
                  }}
                >
                  {result.recipient_risk?.risk_score?.toFixed(1) || '0.0'} ({result.recipient_risk?.risk_level || 'unknown'})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
