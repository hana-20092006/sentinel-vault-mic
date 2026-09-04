"use client";

import { useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import {
  createSentinelTransaction,
  submitDeviceResult,
  authorizeSentinelTransaction,
  executeSentinelTransaction,
  SentinelTransactionResponse,
} from "@/lib/api";

type MLFeatures = {
  Avg_min_between_sent_tnx: number;
  Avg_min_between_received_tnx: number;
  Time_Diff_between_first_and_last_Mins_: number;
  Sent_tnx: number;
  Received_Tnx: number;
  total_transactions: number;
  avg_val_received: number;
  avg_val_sent: number;
};

type ScenarioContext = {
  new_device: boolean;
  new_beneficiary: boolean;
  unusual_time: boolean;
  amount_deviation: number;
  recent_transaction_count: number;
  additional_features?: {
    ml_features?: MLFeatures;
    [key: string]: any;
  };
};

type Scenario = {
  id: string;
  name: string;
  description: string;
  amount: number;
  destination: string;
  context: ScenarioContext;
};

const scenarios: Scenario[] = [
  {
    id: "normal",
    name: "Normal Transaction",
    description: "Known device, known beneficiary, normal behaviour.",
    amount: 25000,
    destination: "0xKNOWN-SUPPLIER",
    context: {
      new_device: false,
      new_beneficiary: false,
      unusual_time: false,
      amount_deviation: 0.05,
      recent_transaction_count: 1,
      additional_features: {
        ml_features: {
          Avg_min_between_sent_tnx: 1440,
          Avg_min_between_received_tnx: 720,
          Time_Diff_between_first_and_last_Mins_: 43200,
          Sent_tnx: 30,
          Received_Tnx: 42,
          total_transactions: 72,
          avg_val_received: 18500,
          avg_val_sent: 12000,
        },
      },
    },
  },

  {
    id: "contextual",
    name: "Contextual Attack",
    description:
      "A legitimate transfer becomes suspicious when multiple signals appear together.",
    amount: 500000,
    destination: "0xNEW-SUPPLIER",
    context: {
      new_device: true,
      new_beneficiary: true,
      unusual_time: true,
      amount_deviation: 0.8,
      recent_transaction_count: 3,
      additional_features: {
        recent_small_transfers: true,
        beneficiary_age_days: 1,
        device_age_days: 1,
        ml_features: {
          Avg_min_between_sent_tnx: 18,
          Avg_min_between_received_tnx: 720,
          Time_Diff_between_first_and_last_Mins_: 43200,
          Sent_tnx: 38,
          Received_Tnx: 42,
          total_transactions: 80,
          avg_val_received: 18500,
          avg_val_sent: 48500,
        },
      },
    },
  },

  {
    id: "burst",
    name: "Suspicious Activity Burst",
    description:
      "Several recent transactions indicate abnormal activity around the account.",
    amount: 150000,
    destination: "0xRECENT-BENEFICIARY",
    context: {
      new_device: false,
      new_beneficiary: true,
      unusual_time: true,
      amount_deviation: 0.65,
      recent_transaction_count: 8,
      additional_features: {
        rapid_transaction_sequence: true,
        multiple_recent_beneficiaries: true,
        ml_features: {
          Avg_min_between_sent_tnx: 3,
          Avg_min_between_received_tnx: 12,
          Time_Diff_between_first_and_last_Mins_: 43200,
          Sent_tnx: 75,
          Received_Tnx: 48,
          total_transactions: 123,
          avg_val_received: 16000,
          avg_val_sent: 32000,
        },
      },
    },
  },
];

const defaultCustomContext: ScenarioContext = {
  new_device: false,
  new_beneficiary: false,
  unusual_time: false,
  amount_deviation: 0.05,
  recent_transaction_count: 1,
  additional_features: {
    ml_features: {
      Avg_min_between_sent_tnx: 1440,
      Avg_min_between_received_tnx: 720,
      Time_Diff_between_first_and_last_Mins_: 43200,
      Sent_tnx: 30,
      Received_Tnx: 42,
      total_transactions: 72,
      avg_val_received: 18500,
      avg_val_sent: 12000,
    },
  },
};

export default function SecurityPage() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(
    scenarios[1]
  );

  const [isCustom, setIsCustom] = useState(false);

  const [customAmount, setCustomAmount] = useState("25000");
  const [customDestination, setCustomDestination] =
    useState("0xCUSTOM-DESTINATION");

  const [customContext, setCustomContext] =
    useState<ScenarioContext>(defaultCustomContext);

  const [transaction, setTransaction] =
    useState<SentinelTransactionResponse | null>(null);

  const [stage, setStage] = useState("READY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeAmount = isCustom
    ? Number(customAmount) || 0
    : selectedScenario.amount;

  const activeDestination = isCustom
    ? customDestination || "0xCUSTOM-DESTINATION"
    : selectedScenario.destination;

  const activeContext = isCustom
    ? customContext
    : selectedScenario.context;

  const updateCustomMLFeature = (
    key: keyof MLFeatures,
    value: string
  ) => {
    setCustomContext((previous) => ({
      ...previous,
      additional_features: {
        ...previous.additional_features,
        ml_features: {
          ...previous.additional_features?.ml_features,
          [key]: Number(value) || 0,
        } as MLFeatures,
      },
    }));
  };

  const runSimulation = async () => {
    try {
      setLoading(true);
      setError("");
      setTransaction(null);
      setStage("ANALYZING");

      const result = await createSentinelTransaction({
        sender: "0xSENTINEL-DEMO",
        destination: activeDestination,
        amount: activeAmount,
        currency: "INR",
        transaction_type: "TRANSFER",
        device_id: "DEVICE-001",
        context: activeContext,
        expires_in_seconds: 120,
      });

      setTransaction(result);
      setStage("RISK_DECISION");
    } catch (err: any) {
      setError(err.message || "Simulation failed");
      setStage("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const verifyHardware = async () => {
    if (!transaction) return;

    try {
      setLoading(true);
      setError("");

      await submitDeviceResult(transaction.transaction_id, {
        device_id: "DEVICE-001",
        result: "VERIFIED",
        timestamp: new Date().toISOString(),
        details: {
          signature_valid: true,
          payload_hash_valid: true,
          user_confirmed: true,
          simulation: true,
        },
      });

      setStage("HARDWARE_VERIFIED");
    } catch (err: any) {
      setError(err.message || "Hardware verification failed");
      setStage("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const authorize = async () => {
    if (!transaction) return;

    try {
      setLoading(true);
      setError("");

      await authorizeSentinelTransaction(
        transaction.transaction_id,
        "APPROVE"
      );

      setStage("AUTHORIZED");
    } catch (err: any) {
      setError(err.message || "Authorization failed");
      setStage("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    if (!transaction) return;

    try {
      setLoading(true);
      setError("");

      await executeSentinelTransaction(transaction.transaction_id);

      setStage("EXECUTED");
    } catch (err: any) {
      setError(err.message || "Execution failed");
      setStage("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const resetSimulation = () => {
    setTransaction(null);
    setStage("READY");
    setError("");
  };

  const riskScore = transaction
    ? Math.round(transaction.backend_risk.score * 100)
    : null;

  const riskLevel = transaction?.backend_risk.level || null;

  const mlFeatures =
    activeContext.additional_features?.ml_features;

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1150 }}>
        {/* HEADER */}
        <div style={{ marginBottom: "var(--spacing-8)" }}>
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: "var(--text-muted)",
              marginBottom: "8px",
            }}
          >
            SENTINELVAULT / SECURITY INTELLIGENCE
          </div>

          <h1
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "2rem",
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Security Simulation Lab
          </h1>

          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              marginTop: "8px",
              maxWidth: 680,
              lineHeight: 1.6,
            }}
          >
            See how SentinelVault evaluates transaction context before
            allowing an irreversible financial commitment.
          </p>
        </div>

        {/* SCENARIO SELECTOR */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "20px",
          }}
        >
          {scenarios.map((scenario) => {
            const selected =
              !isCustom && selectedScenario.id === scenario.id;

            return (
              <button
                key={scenario.id}
                onClick={() => {
                  setSelectedScenario(scenario);
                  setIsCustom(false);
                  resetSimulation();
                }}
                style={{
                  textAlign: "left",
                  padding: "18px",
                  borderRadius: "14px",
                  border: selected
                    ? "1px solid var(--text-primary)"
                    : "1px solid var(--border-subtle)",
                  background: selected
                    ? "var(--bg-surface-container-high)"
                    : "var(--bg-surface-container)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    marginBottom: "8px",
                  }}
                >
                  {scenario.name.toUpperCase()}
                </div>

                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  {scenario.description}
                </div>

                <div
                  style={{
                    marginTop: "14px",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                  }}
                >
                  ₹{scenario.amount.toLocaleString("en-IN")}
                </div>
              </button>
            );
          })}

          {/* CUSTOM */}
          <button
            onClick={() => {
              setIsCustom(true);
              resetSimulation();
            }}
            style={{
              textAlign: "left",
              padding: "18px",
              borderRadius: "14px",
              border: isCustom
                ? "1px solid var(--text-primary)"
                : "1px solid var(--border-subtle)",
              background: isCustom
                ? "var(--bg-surface-container-high)"
                : "var(--bg-surface-container)",
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 800,
                letterSpacing: "0.08em",
                marginBottom: "8px",
              }}
            >
              CUSTOM TRANSACTION
            </div>

            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              Enter your own transaction and behavioural context.
            </div>

            <div
              style={{
                marginTop: "14px",
                fontSize: "0.9rem",
                fontWeight: 700,
              }}
            >
              INTERACTIVE
            </div>
          </button>
        </div>

        {/* CUSTOM INPUT FORM */}
        {isCustom && (
          <div
            className="card"
            style={{
              padding: "22px",
              marginBottom: "20px",
              background: "var(--bg-surface-container)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                marginBottom: "18px",
              }}
            >
              CUSTOM TRANSACTION INPUT
            </div>

            {/* Transaction details */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                marginBottom: "22px",
              }}
            >
              <InputField
                label="AMOUNT (INR)"
                value={customAmount}
                onChange={setCustomAmount}
                type="number"
              />

              <InputField
                label="DESTINATION"
                value={customDestination}
                onChange={setCustomDestination}
              />
            </div>

            {/* Context toggles */}
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginBottom: "10px",
              }}
            >
              TRANSACTION CONTEXT
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "10px",
                marginBottom: "20px",
              }}
            >
              <ToggleField
                label="NEW DEVICE"
                value={customContext.new_device}
                onChange={(value) =>
                  setCustomContext((previous) => ({
                    ...previous,
                    new_device: value,
                  }))
                }
              />

              <ToggleField
                label="NEW BENEFICIARY"
                value={customContext.new_beneficiary}
                onChange={(value) =>
                  setCustomContext((previous) => ({
                    ...previous,
                    new_beneficiary: value,
                  }))
                }
              />

              <ToggleField
                label="UNUSUAL TIME"
                value={customContext.unusual_time}
                onChange={(value) =>
                  setCustomContext((previous) => ({
                    ...previous,
                    unusual_time: value,
                  }))
                }
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                marginBottom: "24px",
              }}
            >
              <InputField
                label="AMOUNT DEVIATION (0 - 1)"
                value={String(customContext.amount_deviation)}
                onChange={(value) =>
                  setCustomContext((previous) => ({
                    ...previous,
                    amount_deviation: Number(value) || 0,
                  }))
                }
                type="number"
              />

              <InputField
                label="RECENT TRANSACTIONS"
                value={String(
                  customContext.recent_transaction_count
                )}
                onChange={(value) =>
                  setCustomContext((previous) => ({
                    ...previous,
                    recent_transaction_count: Number(value) || 0,
                  }))
                }
                type="number"
              />
            </div>

            {/* ML features */}
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
                marginBottom: "12px",
              }}
            >
              BEHAVIOURAL ML FEATURES
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
              }}
            >
              <InputField
                label="AVG TIME BETWEEN SENT TXNS (MIN)"
                value={String(
                  mlFeatures?.Avg_min_between_sent_tnx ?? 0
                )}
                onChange={(value) =>
                  updateCustomMLFeature(
                    "Avg_min_between_sent_tnx",
                    value
                  )
                }
                type="number"
              />

              <InputField
                label="AVG TIME BETWEEN RECEIVED TXNS (MIN)"
                value={String(
                  mlFeatures?.Avg_min_between_received_tnx ?? 0
                )}
                onChange={(value) =>
                  updateCustomMLFeature(
                    "Avg_min_between_received_tnx",
                    value
                  )
                }
                type="number"
              />

              <InputField
                label="TOTAL ACTIVE DURATION (MIN)"
                value={String(
                  mlFeatures?.Time_Diff_between_first_and_last_Mins_ ??
                    0
                )}
                onChange={(value) =>
                  updateCustomMLFeature(
                    "Time_Diff_between_first_and_last_Mins_",
                    value
                  )
                }
                type="number"
              />

              <InputField
                label="SENT TRANSACTIONS"
                value={String(mlFeatures?.Sent_tnx ?? 0)}
                onChange={(value) =>
                  updateCustomMLFeature("Sent_tnx", value)
                }
                type="number"
              />

              <InputField
                label="RECEIVED TRANSACTIONS"
                value={String(mlFeatures?.Received_Tnx ?? 0)}
                onChange={(value) =>
                  updateCustomMLFeature("Received_Tnx", value)
                }
                type="number"
              />

              <InputField
                label="TOTAL TRANSACTIONS"
                value={String(mlFeatures?.total_transactions ?? 0)}
                onChange={(value) =>
                  updateCustomMLFeature(
                    "total_transactions",
                    value
                  )
                }
                type="number"
              />

              <InputField
                label="AVG VALUE RECEIVED (INR)"
                value={String(mlFeatures?.avg_val_received ?? 0)}
                onChange={(value) =>
                  updateCustomMLFeature(
                    "avg_val_received",
                    value
                  )
                }
                type="number"
              />

              <InputField
                label="AVG VALUE SENT (INR)"
                value={String(mlFeatures?.avg_val_sent ?? 0)}
                onChange={(value) =>
                  updateCustomMLFeature("avg_val_sent", value)
                }
                type="number"
              />
            </div>
          </div>
        )}

        {/* RUN SIMULATION */}
        <div
          className="card"
          style={{
            padding: "18px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            background: "var(--bg-surface-container)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.1em",
                color: "var(--text-muted)",
              }}
            >
              SELECTED MODE
            </div>

            <div
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginTop: "5px",
              }}
            >
              {isCustom ? "Custom Transaction" : selectedScenario.name}
            </div>

            <p
              style={{
                marginTop: 8,
                color: "var(--text-secondary)",
                fontSize: 14,
              }}
            >
              Sentinel will evaluate the transaction context before
              authorization.
            </p>
          </div>

          <button
            onClick={runSimulation}
            disabled={loading}
            style={{
              minWidth: 220,
              padding: "16px 24px",
              borderRadius: 12,
              border: "none",
              background: loading ? "#555" : "#f1f2f6",
              color: "#111318",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            }}
          >
            {loading ? "ANALYZING..." : "RUN SECURITY CHECK →"}
          </button>
        </div>

        {/* MAIN SIMULATION */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 0.85fr",
            gap: "16px",
          }}
        >
          {/* CONTEXT */}
          <div
            className="card"
            style={{
              padding: "22px",
              background: "var(--bg-surface-container)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                marginBottom: "18px",
              }}
            >
              CONTEXT INTELLIGENCE
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
              }}
            >
              <Signal
                label="NEW DEVICE"
                active={activeContext.new_device}
              />

              <Signal
                label="NEW BENEFICIARY"
                active={activeContext.new_beneficiary}
              />

              <Signal
                label="UNUSUAL TIME"
                active={activeContext.unusual_time}
              />

              <Signal
                label="AMOUNT DEVIATION"
                active={activeContext.amount_deviation > 0.5}
              />

              <Signal
                label="RECENT ACTIVITY"
                active={activeContext.recent_transaction_count >= 5}
              />

              <Signal
                label="BEHAVIOURAL PROFILE"
                active={Boolean(
                  activeContext.additional_features?.ml_features
                )}
              />
            </div>

            <div
              style={{
                marginTop: "20px",
                paddingTop: "18px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              <InfoRow
                label="DESTINATION"
                value={activeDestination}
              />

              <InfoRow
                label="AMOUNT"
                value={`₹${activeAmount.toLocaleString("en-IN")}`}
              />

              <InfoRow
                label="DEVICE"
                value="DEVICE-001"
              />

              <InfoRow
                label="RECENT TRANSACTIONS"
                value={String(
                  activeContext.recent_transaction_count
                )}
              />
            </div>
          </div>

          {/* DECISION */}
          <div
            className="card"
            style={{
              padding: "22px",
              background: "var(--bg-surface-container)",
            }}
          >
            <div
              style={{
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "var(--text-muted)",
                marginBottom: "18px",
              }}
            >
              SENTINEL DECISION
            </div>

            {!transaction ? (
              <div
                style={{
                  minHeight: 230,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.8rem",
                }}
              >
                Run a security check to activate the risk engine.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "3rem",
                      fontWeight: 800,
                      letterSpacing: "-0.06em",
                      color: "var(--text-primary)",
                    }}
                  >
                    {riskScore}%
                  </span>

                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                    }}
                  >
                    {riskLevel}
                  </span>
                </div>

                <div
                  style={{
                    height: 5,
                    background: "var(--border-subtle)",
                    borderRadius: 99,
                    overflow: "hidden",
                    margin: "16px 0",
                  }}
                >
                  <div
                    style={{
                      width: `${riskScore}%`,
                      height: "100%",
                      background: "var(--text-primary)",
                      borderRadius: 99,
                    }}
                  />
                </div>

                <div
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    marginBottom: "10px",
                  }}
                >
                  WHY?
                </div>

                {transaction.backend_risk.reasons.map((reason) => (
                  <div
                    key={reason.code}
                    style={{
                      padding: "9px 0",
                      borderBottom:
                        "1px solid var(--border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                      }}
                    >
                      {reason.code.replaceAll("_", " ")}
                    </div>

                    <div
                      style={{
                        fontSize: "0.68rem",
                        color: "var(--text-muted)",
                        marginTop: "3px",
                        lineHeight: 1.4,
                      }}
                    >
                      {reason.message}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ML FEATURE PAYLOAD PREVIEW */}
        <div
          className="card"
          style={{
            marginTop: "16px",
            padding: "22px",
            background: "var(--bg-surface-container)",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              marginBottom: "18px",
            }}
          >
            BEHAVIOURAL FEATURES → QR PAYLOAD
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "10px",
            }}
          >
            <FeatureCard
              label="AVG SENT INTERVAL"
              value={`${mlFeatures?.Avg_min_between_sent_tnx ?? 0} min`}
            />

            <FeatureCard
              label="AVG RECEIVED INTERVAL"
              value={`${mlFeatures?.Avg_min_between_received_tnx ?? 0} min`}
            />

            <FeatureCard
              label="ACTIVE DURATION"
              value={`${mlFeatures?.Time_Diff_between_first_and_last_Mins_ ?? 0} min`}
            />

            <FeatureCard
              label="SENT TXNS"
              value={String(mlFeatures?.Sent_tnx ?? 0)}
            />

            <FeatureCard
              label="RECEIVED TXNS"
              value={String(mlFeatures?.Received_Tnx ?? 0)}
            />

            <FeatureCard
              label="TOTAL TXNS"
              value={String(mlFeatures?.total_transactions ?? 0)}
            />

            <FeatureCard
              label="AVG RECEIVED VALUE"
              value={`₹${(
                mlFeatures?.avg_val_received ?? 0
              ).toLocaleString("en-IN")}`}
            />

            <FeatureCard
              label="AVG SENT VALUE"
              value={`₹${(
                mlFeatures?.avg_val_sent ?? 0
              ).toLocaleString("en-IN")}`}
            />
          </div>
        </div>

        {/* PIPELINE */}
        <div
          className="card"
          style={{
            marginTop: "16px",
            padding: "22px",
            background: "var(--bg-surface-container)",
          }}
        >
          <div
            style={{
              fontSize: "0.65rem",
              fontWeight: 800,
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              marginBottom: "20px",
            }}
          >
            PRE-COMMITMENT PIPELINE
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: "8px",
            }}
          >
            <Pipeline
              label="CONTEXT"
              active={stage !== "READY"}
              complete={stage !== "READY" && stage !== "ANALYZING"}
            />

            <Pipeline
              label="RISK ENGINE"
              active={
                stage !== "READY" && stage !== "ANALYZING"
              }
              complete={Boolean(transaction)}
            />

            <Pipeline
              label="SIGNED QR"
              active={Boolean(transaction)}
              complete={Boolean(transaction)}
            />

            <Pipeline
              label="HARDWARE"
              active={[
                "HARDWARE_VERIFIED",
                "AUTHORIZED",
                "EXECUTED",
              ].includes(stage)}
              complete={[
                "HARDWARE_VERIFIED",
                "AUTHORIZED",
                "EXECUTED",
              ].includes(stage)}
            />

            <Pipeline
              label="EXECUTION"
              active={stage === "EXECUTED"}
              complete={stage === "EXECUTED"}
            />
          </div>
        </div>

        {/* ACTION */}
        {transaction && (
          <div
            className="card"
            style={{
              marginTop: "16px",
              padding: "22px",
              background: "var(--bg-surface-container)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "20px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    color: "var(--text-muted)",
                  }}
                >
                  CURRENT SECURITY STATE
                </div>

                <div
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    marginTop: "5px",
                    color: "var(--text-primary)",
                  }}
                >
                  {stage === "RISK_DECISION" &&
                    "Risk assessment complete — hardware verification required"}

                  {stage === "HARDWARE_VERIFIED" &&
                    "Hardware verified — awaiting authorization"}

                  {stage === "AUTHORIZED" &&
                    "Authorization accepted — execution permitted"}

                  {stage === "EXECUTED" &&
                    "Simulation completed successfully"}
                </div>

                <div
                  style={{
                    marginTop: "7px",
                    fontSize: "0.68rem",
                    color: "var(--text-muted)",
                  }}
                >
                  {transaction.transaction_id}
                </div>
              </div>

              {stage === "RISK_DECISION" && (
                <button
                  onClick={verifyHardware}
                  disabled={loading}
                  className="primary-button"
                  style={{ width: "auto", margin: 0 }}
                >
                  SIMULATE HARDWARE VERIFICATION
                </button>
              )}

              {stage === "HARDWARE_VERIFIED" && (
                <button
                  onClick={authorize}
                  disabled={loading}
                  className="primary-button"
                  style={{ width: "auto", margin: 0 }}
                >
                  AUTHORIZE
                </button>
              )}

              {stage === "AUTHORIZED" && (
                <button
                  onClick={execute}
                  disabled={loading}
                  className="primary-button"
                  style={{ width: "auto", margin: 0 }}
                >
                  SIMULATE EXECUTION
                </button>
              )}

              {stage === "EXECUTED" && (
                <div
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                  }}
                >
                  ✓ EXECUTED
                </div>
              )}
            </div>
          </div>
        )}

        {/* ERROR */}
        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "9px",
              background: "rgba(239, 83, 80, 0.08)",
              border: "1px solid rgba(239, 83, 80, 0.2)",
              color: "#ff8a87",
              fontSize: "0.7rem",
            }}
          >
            {error}
          </div>
        )}

        {/* FOOTER */}
        <div
          style={{
            marginTop: "18px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.6rem",
            color: "var(--text-muted)",
          }}
        >
          <span>SENTINELVAULT · PRE-COMMITMENT SECURITY</span>
          <span>EXECUTION IS SIMULATED</span>
        </div>
      </div>
    </DashboardLayout>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <div
        style={{
          fontSize: "0.58rem",
          fontWeight: 800,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: "7px",
        }}
      >
        {label}
      </div>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "11px 12px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-surface)",
          color: "var(--text-primary)",
          outline: "none",
          fontSize: "0.75rem",
        }}
      />
    </label>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        padding: "13px",
        borderRadius: "9px",
        border: value
          ? "1px solid var(--text-primary)"
          : "1px solid var(--border-subtle)",
        background: value
          ? "var(--bg-surface-container-high)"
          : "transparent",
        color: "var(--text-primary)",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <span
          style={{
            fontSize: "0.62rem",
            fontWeight: 800,
            letterSpacing: "0.07em",
          }}
        >
          {label}
        </span>

        <span
          style={{
            fontSize: "0.58rem",
            fontWeight: 800,
          }}
        >
          {value ? "ON" : "OFF"}
        </span>
      </div>
    </button>
  );
}

function Signal({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "9px",
        border: "1px solid var(--border-subtle)",
        background: active
          ? "rgba(239, 83, 80, 0.07)"
          : "transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          fontSize: "0.65rem",
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: active
              ? "#ef5350"
              : "var(--text-muted)",
          }}
        />

        {label}
      </div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "0.6rem",
          color: "var(--text-muted)",
        }}
      >
        {active ? "SIGNAL DETECTED" : "NORMAL"}
      </div>
    </div>
  );
}

function FeatureCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "9px",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        style={{
          fontSize: "0.55rem",
          fontWeight: 800,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "0.8rem",
          fontWeight: 700,
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: "0.68rem",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Pipeline({
  label,
  active,
  complete,
}: {
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div
      style={{
        padding: "13px 10px",
        borderRadius: "9px",
        border: "1px solid var(--border-subtle)",
        opacity: active ? 1 : 0.35,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          fontWeight: 800,
        }}
      >
        {complete ? "✓" : "○"} {label}
      </div>

      <div
        style={{
          marginTop: "4px",
          fontSize: "0.55rem",
          color: "var(--text-muted)",
        }}
      >
        {complete
          ? "COMPLETE"
          : active
          ? "ACTIVE"
          : "PENDING"}
      </div>
    </div>
  );
}