"use client";

import { useState, useEffect } from "react";
import { predictRisk, checkRiskAPIHealth, extractFeaturesFromTransactions } from "../../lib/risk";

interface RiskAnalysisProps {
  address: string;
  transactions: any[];
  chain: string;
}

interface RiskPrediction {
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  is_fraud: boolean;
  confidence: number;
  probabilities: {
    legitimate: number;
    fraud: number;
  };
}

export default function RiskAnalysis({ address, transactions, chain }: RiskAnalysisProps) {
  const [riskData, setRiskData] = useState<RiskPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkAPIHealth();
  }, []);

  useEffect(() => {
    if (address && transactions && transactions.length > 0 && apiHealthy) {
      analyzeRisk();
    }
  }, [address, transactions, apiHealthy]);

  const checkAPIHealth = async () => {
    const health = await checkRiskAPIHealth();
    setApiHealthy(health.available && health.status === 'healthy' && health.model_loaded);
  };

  const analyzeRisk = async () => {
    if (!address || !transactions || transactions.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Extract features from transaction data
      const features = extractFeaturesFromTransactions(transactions, address);
      
      // Get risk prediction
      const prediction = await predictRisk(features);
      setRiskData(prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze risk');
      console.error('Risk analysis failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'var(--success)';
      case 'medium':
        return 'var(--warning)';
      case 'high':
        return 'var(--error)';
      default:
        return 'var(--text-muted)';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low':
        return '✅';
      case 'medium':
        return '⚠️';
      case 'high':
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
          Risk Analysis
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
          <p
            style={{
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              margin: "var(--spacing-2) 0 0 0",
            }}
          >
            Please ensure the Crypto ML Chainlink API is running on localhost:8000
          </p>
        </div>
      </div>
    );
  }

  if (!address) {
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
          Risk Analysis
        </h3>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Connect a wallet to analyze risk
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: "var(--bg-surface-container)" }}>
      <style>{`
        @media (max-width: 768px) {
          .risk-score-display {
            font-size: 2rem !important;
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
          Risk Analysis
        </h3>
        <p
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          AI-powered fraud detection and risk assessment
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--spacing-8)",
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
            Analyzing transaction patterns...
          </p>
        </div>
      )}

      {/* Error State */}
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

      {/* Risk Results */}
      {riskData && !loading && !error && (
        <div>
          {/* Risk Score Display */}
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
                fontSize: "2.5rem",
                fontWeight: 700,
                color: getRiskColor(riskData.risk_level),
              }}>
                {riskData.risk_score.toFixed(1)}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "1rem",
                  color: "var(--text-muted)",
                  marginLeft: "var(--spacing-2)",
                }}
              >
                / 100
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--spacing-2)" }}>
              <span style={{ fontSize: "1.5rem" }}>{getRiskIcon(riskData.risk_level)}</span>
              <span
                style={{
                  fontFamily: "var(--font-headline)",
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: getRiskColor(riskData.risk_level),
                  textTransform: "capitalize",
                }}
              >
                {riskData.risk_level} Risk
              </span>
            </div>

            {riskData.is_fraud && (
              <div
                style={{
                  marginTop: "var(--spacing-3)",
                  padding: "var(--spacing-2) var(--spacing-3)",
                  background: "var(--error-container)",
                  borderRadius: "var(--radius-sm)",
                  display: "inline-block",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-label)",
                    fontSize: "0.75rem",
                    color: "var(--error)",
                    fontWeight: 600,
                  }}
                >
                  ⚠️ FRAUD DETECTED
                </span>
              </div>
            )}
          </div>

          {/* Detailed Metrics */}
          <div style={{ display: "grid", gap: "var(--spacing-4)" }}>
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
                Confidence
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {(riskData.confidence * 100).toFixed(1)}%
              </div>
            </div>

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
                Probability Breakdown
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--spacing-2)" }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Legitimate
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--success)",
                  }}
                >
                  {(riskData.probabilities.legitimate * 100).toFixed(1)}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Fraud
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--error)",
                  }}
                >
                  {(riskData.probabilities.fraud * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Transactions */}
      {!loading && !error && !riskData && transactions && transactions.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "var(--spacing-6)",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            No transactions found for risk analysis
          </p>
        </div>
      )}
    </div>
  );
}
