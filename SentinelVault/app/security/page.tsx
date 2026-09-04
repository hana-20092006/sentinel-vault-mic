"use client";

import { useState } from "react";
import {
  createSentinelTransaction,
  submitDeviceResult,
  authorizeSentinelTransaction,
  executeSentinelTransaction,
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
  additional_features: MLFeatures;
};

type Scenario = {
  id: string;
  name: string;
  description: string;
  amount: number;
  destination: string;
  context: ScenarioContext;
};

const defaultMLFeatures: MLFeatures = {
  Avg_min_between_sent_tnx: 120,
  Avg_min_between_received_tnx: 240,
  Time_Diff_between_first_and_last_Mins_: 43200,
  Sent_tnx: 12,
  Received_Tnx: 15,
  total_transactions: 27,
  avg_val_received: 12000,
  avg_val_sent: 8500,
};

const scenarios: Scenario[] = [
  {
    id: "normal",
    name: "Normal Transaction",
    description:
      "A routine transaction from a trusted device to an established beneficiary.",
    amount: 5000,
    destination: "0xKNOWN-BENEFICIARY",
    context: {
      new_device: false,
      new_beneficiary: false,
      unusual_time: false,
      amount_deviation: 0,
      recent_transaction_count: 1,
      additional_features: {
        Avg_min_between_sent_tnx: 180,
        Avg_min_between_received_tnx: 360,
        Time_Diff_between_first_and_last_Mins_: 129600,
        Sent_tnx: 8,
        Received_Tnx: 11,
        total_transactions: 19,
        avg_val_received: 9000,
        avg_val_sent: 6500,
      },
    },
  },

  {
    id: "contextual",
    name: "Contextual Attack",
    description:
      "The transaction appears legitimate, but the surrounding context is highly unusual.",
    amount: 150000,
    destination: "0xNEW-BENEFICIARY",
    context: {
      new_device: true,
      new_beneficiary: true,
      unusual_time: true,
      amount_deviation: 0.9,
      recent_transaction_count: 3,
      additional_features: {
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
];

const emptyCustomContext: ScenarioContext = {
  new_device: false,
  new_beneficiary: false,
  unusual_time: false,
  amount_deviation: 0,
  recent_transaction_count: 1,
  additional_features: defaultMLFeatures,
};

export default function SecurityPage() {
  const [selectedScenario, setSelectedScenario] = useState("normal");
  const [isCustom, setIsCustom] = useState(false);

  const [customAmount, setCustomAmount] = useState(5000);
  const [customDestination, setCustomDestination] =
    useState("0xCUSTOM-BENEFICIARY");

  const [customContext, setCustomContext] =
    useState<ScenarioContext>(emptyCustomContext);

  const [transaction, setTransaction] = useState<any>(null);
  const [stage, setStage] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const activeScenario = isCustom
    ? {
        id: "custom",
        name: "Custom Transaction",
        description:
          "Configure your own transaction and behavioural context.",
        amount: customAmount,
        destination: customDestination,
        context: customContext,
      }
    : scenarios.find((scenario) => scenario.id === selectedScenario)!;

  function updateCustomFeature(
    key: keyof MLFeatures,
    value: number
  ) {
    setCustomContext((previous) => ({
      ...previous,
      additional_features: {
        ...previous.additional_features,
        [key]: value,
      },
    }));
  }

  function updateContext(
    key: keyof Omit<
      ScenarioContext,
      "additional_features"
    >,
    value: boolean | number
  ) {
    setCustomContext((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function runSimulation() {
    setLoading(true);
    setError("");
    setTransaction(null);
    setStage("analyzing");

    try {
      const result = await createSentinelTransaction({
        sender: "0xSENTINEL-USER",
        destination: activeScenario.destination,
        amount: Number(activeScenario.amount),
        currency: "INR",
        transaction_type: "TRANSFER",
        device_id: "ESP32-SENTINEL-001",
        context: {
          new_device: activeScenario.context.new_device,
          new_beneficiary: activeScenario.context.new_beneficiary,
          unusual_time: activeScenario.context.unusual_time,
          amount_deviation:
            activeScenario.context.amount_deviation,
          recent_transaction_count:
            activeScenario.context.recent_transaction_count,

          // IMPORTANT:
          // The QR payload uses exactly these 8 features.
          additional_features:
            activeScenario.context.additional_features,
        },
        expires_in_seconds: 300,
      });

      setTransaction(result);
      setStage("risk_complete");
    } catch (err: any) {
      setError(err?.message || "Security analysis failed.");
      setStage("error");
    } finally {
      setLoading(false);
    }
  }

  async function runHardwareVerification() {
    if (!transaction) return;

    setLoading(true);
    setError("");
    setStage("hardware");

    try {
      await submitDeviceResult(transaction.transaction_id, {
        device_id: "ESP32-SENTINEL-001",
        result: "VERIFIED",
        timestamp: new Date().toISOString(),
        details: {
          signature_valid: true,
          payload_hash_valid: true,
          user_confirmed: true,
          simulated: true,
        },
      });

      setStage("verified");
    } catch (err: any) {
      setError(err?.message || "Hardware verification failed.");
      setStage("error");
    } finally {
      setLoading(false);
    }
  }

  async function authorizeTransaction() {
    if (!transaction) return;

    setLoading(true);
    setError("");
    setStage("authorizing");

    try {
      await authorizeSentinelTransaction(
        transaction.transaction_id,
        "APPROVE"
      );

      setStage("authorized");
    } catch (err: any) {
      setError(err?.message || "Authorization failed.");
      setStage("error");
    } finally {
      setLoading(false);
    }
  }

  async function executeTransaction() {
    if (!transaction) return;

    setLoading(true);
    setError("");
    setStage("executing");

    try {
      await executeSentinelTransaction(
        transaction.transaction_id
      );

      setStage("executed");
    } catch (err: any) {
      setError(err?.message || "Execution failed.");
      setStage("error");
    } finally {
      setLoading(false);
    }
  }

  function resetSimulation() {
    setTransaction(null);
    setStage("idle");
    setError("");
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.25em] text-cyan-400">
            SentinelVault
          </p>

          <h1 className="text-4xl font-bold tracking-tight">
            Security Simulation Lab
          </h1>

          <p className="mt-3 max-w-3xl text-gray-400">
            Evaluate transaction risk using behavioural context before
            the transaction becomes irreversible.
          </p>
        </div>

        {/* SCENARIO SELECTOR */}
        <section className="mb-8">
          <div className="grid gap-4 md:grid-cols-4">

            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => {
                  setSelectedScenario(scenario.id);
                  setIsCustom(false);
                  resetSimulation();
                }}
                className={`rounded-2xl border p-5 text-left transition ${
                  !isCustom &&
                  selectedScenario === scenario.id
                    ? "border-cyan-400 bg-cyan-400/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/30"
                }`}
              >
                <div className="mb-2 text-lg font-semibold">
                  {scenario.name}
                </div>

                <p className="text-sm leading-6 text-gray-400">
                  {scenario.description}
                </p>
              </button>
            ))}

            <button
              onClick={() => {
                setIsCustom(true);
                resetSimulation();
              }}
              className={`rounded-2xl border p-5 text-left transition ${
                isCustom
                  ? "border-purple-400 bg-purple-400/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/30"
              }`}
            >
              <div className="mb-2 text-lg font-semibold">
                Custom Transaction
              </div>

              <p className="text-sm leading-6 text-gray-400">
                Configure your own transaction and risk signals.
              </p>
            </button>

          </div>
        </section>

        {/* CUSTOM CONFIGURATION */}
        {isCustom && (
          <section className="mb-8 rounded-2xl border border-purple-400/30 bg-purple-400/5 p-6">

            <h2 className="mb-6 text-xl font-semibold">
              Custom Transaction
            </h2>

            <div className="grid gap-5 md:grid-cols-2">

              <InputField
                label="Amount"
                type="number"
                value={customAmount}
                onChange={(value) =>
                  setCustomAmount(Number(value))
                }
              />

              <InputField
                label="Destination"
                value={customDestination}
                onChange={setCustomDestination}
              />

              <ToggleField
                label="New Device"
                value={customContext.new_device}
                onChange={(value) =>
                  updateContext("new_device", value)
                }
              />

              <ToggleField
                label="New Beneficiary"
                value={customContext.new_beneficiary}
                onChange={(value) =>
                  updateContext("new_beneficiary", value)
                }
              />

              <ToggleField
                label="Unusual Time"
                value={customContext.unusual_time}
                onChange={(value) =>
                  updateContext("unusual_time", value)
                }
              />

              <InputField
                label="Amount Deviation"
                type="number"
                step="0.05"
                value={customContext.amount_deviation}
                onChange={(value) =>
                  updateContext(
                    "amount_deviation",
                    Number(value)
                  )
                }
              />

              <InputField
                label="Recent Transaction Count"
                type="number"
                value={customContext.recent_transaction_count}
                onChange={(value) =>
                  updateContext(
                    "recent_transaction_count",
                    Number(value)
                  )
                }
              />

            </div>

            <h3 className="mb-4 mt-8 text-lg font-semibold">
              USO Behavioural Features
            </h3>

            <div className="grid gap-4 md:grid-cols-4">
              <FeatureInput
                label="Avg sent interval"
                value={
                  customContext.additional_features
                    .Avg_min_between_sent_tnx
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "Avg_min_between_sent_tnx",
                    value
                  )
                }
              />

              <FeatureInput
                label="Avg received interval"
                value={
                  customContext.additional_features
                    .Avg_min_between_received_tnx
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "Avg_min_between_received_tnx",
                    value
                  )
                }
              />

              <FeatureInput
                label="Account lifetime mins"
                value={
                  customContext.additional_features
                    .Time_Diff_between_first_and_last_Mins_
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "Time_Diff_between_first_and_last_Mins_",
                    value
                  )
                }
              />

              <FeatureInput
                label="Sent transactions"
                value={
                  customContext.additional_features.Sent_tnx
                }
                onChange={(value) =>
                  updateCustomFeature("Sent_tnx", value)
                }
              />

              <FeatureInput
                label="Received transactions"
                value={
                  customContext.additional_features.Received_Tnx
                }
                onChange={(value) =>
                  updateCustomFeature("Received_Tnx", value)
                }
              />

              <FeatureInput
                label="Total transactions"
                value={
                  customContext.additional_features
                    .total_transactions
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "total_transactions",
                    value
                  )
                }
              />

              <FeatureInput
                label="Avg value received"
                value={
                  customContext.additional_features
                    .avg_val_received
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "avg_val_received",
                    value
                  )
                }
              />

              <FeatureInput
                label="Avg value sent"
                value={
                  customContext.additional_features.avg_val_sent
                }
                onChange={(value) =>
                  updateCustomFeature(
                    "avg_val_sent",
                    value
                  )
                }
              />
            </div>
          </section>
        )}

        {/* ACTIVE TRANSACTION */}
        <section className="grid gap-8 lg:grid-cols-2">

          {/* LEFT */}
          <div className="space-y-6">

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">

              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Transaction Context
                </h2>

                <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-400">
                  {activeScenario.name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InfoRow
                  label="Amount"
                  value={`₹${Number(
                    activeScenario.amount
                  ).toLocaleString()}`}
                />

                <InfoRow
                  label="Destination"
                  value={activeScenario.destination}
                />

                <InfoRow
                  label="New Device"
                  value={
                    activeScenario.context.new_device
                      ? "YES"
                      : "NO"
                  }
                />

                <InfoRow
                  label="New Beneficiary"
                  value={
                    activeScenario.context.new_beneficiary
                      ? "YES"
                      : "NO"
                  }
                />

                <InfoRow
                  label="Unusual Time"
                  value={
                    activeScenario.context.unusual_time
                      ? "YES"
                      : "NO"
                  }
                />

                <InfoRow
                  label="Recent Transactions"
                  value={String(
                    activeScenario.context
                      .recent_transaction_count
                  )}
                />
              </div>
            </div>

            {/* RUN */}
            <button
              onClick={runSimulation}
              disabled={loading}
              className="w-full rounded-2xl bg-cyan-400 px-6 py-4 font-bold text-black transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Running Security Check..."
                : "Run Sentinel Security Check"}
            </button>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                {error}
              </div>
            )}

          </div>

          {/* RIGHT */}
          <div className="space-y-6">

            {/* PIPELINE */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">

              <h2 className="mb-6 text-xl font-semibold">
                Pre-Commitment Pipeline
              </h2>

              <Pipeline
                active={stage !== "idle"}
                completed={
                  [
                    "risk_complete",
                    "hardware",
                    "verified",
                    "authorizing",
                    "authorized",
                    "executing",
                    "executed",
                  ].includes(stage)
                }
                title="1. Contextual Risk Analysis"
                description="Behavioural and transaction context is evaluated."
              />

              <Pipeline
                active={[
                  "hardware",
                  "verified",
                  "authorizing",
                  "authorized",
                  "executing",
                  "executed",
                ].includes(stage)}
                completed={[
                  "verified",
                  "authorizing",
                  "authorized",
                  "executing",
                  "executed",
                ].includes(stage)}
                title="2. Hardware Verification"
                description="Secure device confirmation is simulated."
              />

              <Pipeline
                active={[
                  "authorizing",
                  "authorized",
                  "executing",
                  "executed",
                ].includes(stage)}
                completed={[
                  "authorized",
                  "executing",
                  "executed",
                ].includes(stage)}
                title="3. Authorization"
                description="Transaction is authorized after verification."
              />

              <Pipeline
                active={[
                  "executing",
                  "executed",
                ].includes(stage)}
                completed={stage === "executed"}
                title="4. Execution"
                description="Final execution is simulated."
              />

            </div>

            {/* RISK RESULT */}
            {transaction && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">

                <h2 className="mb-5 text-xl font-semibold">
                  Sentinel Decision
                </h2>

                <div className="mb-6 flex items-center justify-between">

                  <div>
                    <p className="text-sm text-gray-500">
                      Risk Score
                    </p>

                    <p className="text-4xl font-bold">
                      {Math.round(
                        transaction.backend_risk.score * 100
                      )}
                      %
                    </p>
                  </div>

                  <div
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      transaction.backend_risk.level === "HIGH"
                        ? "bg-red-500/20 text-red-400"
                        : transaction.backend_risk.level ===
                          "MEDIUM"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {transaction.backend_risk.level}
                  </div>

                </div>

                <div className="space-y-3">
                  {transaction.backend_risk.reasons.length ===
                  0 ? (
                    <p className="text-sm text-gray-400">
                      No significant contextual anomalies detected.
                    </p>
                  ) : (
                    transaction.backend_risk.reasons.map(
                      (reason: any) => (
                        <div
                          key={reason.code}
                          className="rounded-xl border border-white/10 bg-black/30 p-3"
                        >
                          <p className="text-sm font-semibold">
                            {reason.code}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            {reason.message}
                          </p>
                        </div>
                      )
                    )
                  )}
                </div>

              </div>
            )}

          </div>
        </section>

        {/* QR FEATURES */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">

          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Behavioural Features → QR Payload
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              SentinelVault carries only the eight USO behavioural
              features in the QR payload.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">

            <FeatureCard
              name="Avg_min_between_sent_tnx"
              value={
                activeScenario.context.additional_features
                  .Avg_min_between_sent_tnx
              }
            />

            <FeatureCard
              name="Avg_min_between_received_tnx"
              value={
                activeScenario.context.additional_features
                  .Avg_min_between_received_tnx
              }
            />

            <FeatureCard
              name="Time_Diff_between_first_and_last_Mins_"
              value={
                activeScenario.context.additional_features
                  .Time_Diff_between_first_and_last_Mins_
              }
            />

            <FeatureCard
              name="Sent_tnx"
              value={
                activeScenario.context.additional_features.Sent_tnx
              }
            />

            <FeatureCard
              name="Received_Tnx"
              value={
                activeScenario.context.additional_features
                  .Received_Tnx
              }
            />

            <FeatureCard
              name="total_transactions"
              value={
                activeScenario.context.additional_features
                  .total_transactions
              }
            />

            <FeatureCard
              name="avg_val_received"
              value={
                activeScenario.context.additional_features
                  .avg_val_received
              }
            />

            <FeatureCard
              name="avg_val_sent"
              value={
                activeScenario.context.additional_features
                  .avg_val_sent
              }
            />

          </div>
        </section>

        {/* ACTIONS */}
        {transaction && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">

            <h2 className="mb-5 text-xl font-semibold">
              Security Actions
            </h2>

            <div className="flex flex-wrap gap-4">

              {stage === "risk_complete" && (
                <button
                  onClick={runHardwareVerification}
                  disabled={loading}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-300 hover:bg-cyan-400/20"
                >
                  Simulate Hardware Verification
                </button>
              )}

              {stage === "verified" && (
                <button
                  onClick={authorizeTransaction}
                  disabled={loading}
                  className="rounded-xl border border-green-400/40 bg-green-400/10 px-5 py-3 font-semibold text-green-300 hover:bg-green-400/20"
                >
                  Authorize Transaction
                </button>
              )}

              {stage === "authorized" && (
                <button
                  onClick={executeTransaction}
                  disabled={loading}
                  className="rounded-xl border border-purple-400/40 bg-purple-400/10 px-5 py-3 font-semibold text-purple-300 hover:bg-purple-400/20"
                >
                  Simulate Execution
                </button>
              )}

              {stage === "executed" && (
                <div className="rounded-xl border border-green-400/30 bg-green-400/10 px-5 py-3 font-semibold text-green-300">
                  ✓ Transaction execution simulated successfully
                </div>
              )}

              <button
                onClick={resetSimulation}
                className="rounded-xl border border-white/10 px-5 py-3 text-gray-300 hover:bg-white/5"
              >
                Reset
              </button>

            </div>
          </section>
        )}

        {/* FOOTER MESSAGE */}
        <div className="mt-10 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6 text-center">
          <p className="text-lg font-medium">
            The transaction may be legitimate in isolation.
          </p>

          <p className="mt-2 text-sm text-gray-400">
            SentinelVault evaluates the context around it before
            commitment.
          </p>
        </div>

      </div>
    </main>
  );
}


/* -------------------------------------------------
   COMPONENTS
------------------------------------------------- */

function InputField({
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  value: string | number;
  onChange: (value: any) => void;
  type?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-gray-400">
        {label}
      </span>

      <input
        type={type}
        step={step}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-cyan-400"
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
      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left"
    >
      <span className="text-sm text-gray-300">
        {label}
      </span>

      <span
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          value
            ? "bg-red-500/20 text-red-400"
            : "bg-green-500/20 text-green-400"
        }`}
      >
        {value ? "YES" : "NO"}
      </span>
    </button>
  );
}


function FeatureInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-gray-500">
        {label}
      </span>

      <input
        type="number"
        value={value}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
      />
    </label>
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
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 break-all text-sm font-medium text-gray-200">
        {value}
      </p>
    </div>
  );
}


function FeatureCard({
  name,
  value,
}: {
  name: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="break-all text-xs text-gray-500">
        {name}
      </p>

      <p className="mt-2 text-lg font-semibold">
        {value}
      </p>
    </div>
  );
}


function Pipeline({
  active,
  completed,
  title,
  description,
}: {
  active: boolean;
  completed: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex gap-4">

      <div
        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          completed
            ? "bg-green-400 text-black"
            : active
            ? "bg-cyan-400 text-black"
            : "bg-white/10 text-gray-500"
        }`}
      >
        {completed ? "✓" : "•"}
      </div>

      <div>
        <p
          className={`font-medium ${
            active || completed
              ? "text-white"
              : "text-gray-500"
          }`}
        >
          {title}
        </p>

        <p className="mt-1 text-xs text-gray-500">
          {description}
        </p>
      </div>

    </div>
  );
}