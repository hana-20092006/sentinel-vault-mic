"use client";

import { useState } from "react";
import {
  createSentinelTransaction,
  submitDeviceResult,
  authorizeSentinelTransaction,
  executeSentinelTransaction,
  SentinelTransactionResponse,
} from "@/lib/api";

type Stage =
  | "IDLE"
  | "ANALYZING"
  | "QR_GENERATED"
  | "HARDWARE"
  | "APPROVAL"
  | "APPROVED"
  | "EXECUTED"
  | "ERROR";

export default function SentinelSecurityConsole() {
  const [stage, setStage] = useState<Stage>("IDLE");
  const [transaction, setTransaction] =
    useState<SentinelTransactionResponse | null>(null);
  const [error, setError] = useState("");

  const [amount, setAmount] = useState("500000");
  const [destination, setDestination] = useState("0xSUPPLIER999");

  const runTransaction = async () => {
    try {
      setError("");
      setStage("ANALYZING");

      const result = await createSentinelTransaction({
        sender: "0xSENTINEL001",
        destination,
        amount: Number(amount),
        currency: "INR",
        transaction_type: "TRANSFER",
        device_id: "DEVICE-001",
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
          },
        },
        expires_in_seconds: 120,
      });

      setTransaction(result);
      setStage("QR_GENERATED");
    } catch (err: any) {
      setError(err.message || "Transaction analysis failed");
      setStage("ERROR");
    }
  };

  const verifyHardware = async () => {
    if (!transaction) return;

    try {
      setError("");

      await submitDeviceResult(transaction.transaction_id, {
        device_id: "DEVICE-001",
        result: "VERIFIED",
        timestamp: new Date().toISOString(),
        details: {
          signature_valid: true,
          payload_hash_valid: true,
          user_confirmed: true,
        },
      });

      setStage("APPROVAL");
    } catch (err: any) {
      setError(err.message || "Hardware verification failed");
      setStage("ERROR");
    }
  };

  const approveTransaction = async () => {
    if (!transaction) return;

    try {
      setError("");

      await authorizeSentinelTransaction(
        transaction.transaction_id,
        "APPROVE"
      );

      setStage("APPROVED");
    } catch (err: any) {
      setError(err.message || "Authorization failed");
      setStage("ERROR");
    }
  };

  const executeTransaction = async () => {
    if (!transaction) return;

    try {
      setError("");

      await executeSentinelTransaction(transaction.transaction_id);

      setStage("EXECUTED");
    } catch (err: any) {
      setError(err.message || "Execution failed");
      setStage("ERROR");
    }
  };

  const riskScore = transaction
    ? Math.round(transaction.backend_risk.score * 100)
    : 0;

  return (
    <div className="sentinel-console">
      <div className="sentinel-header">
        <div>
          <div className="sentinel-eyebrow">
            SENTINELVAULT SECURITY LAYER
          </div>

          <h2>Transaction Security Console</h2>

          <p>
            Evaluate transaction context before it becomes irreversible.
          </p>
        </div>

        <div className="sentinel-status">
          <span className="status-dot" />
          SENTINEL ONLINE
        </div>
      </div>

      <div className="sentinel-grid">
        {/* Transaction */}
        <div className="sentinel-card">
          <div className="card-title">TRANSACTION</div>

          <div className="input-group">
            <label>Amount</label>

            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={stage !== "IDLE" && stage !== "ERROR"}
            />
          </div>

          <div className="input-group">
            <label>Destination</label>

            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={stage !== "IDLE" && stage !== "ERROR"}
            />
          </div>

          <div className="transaction-meta">
            <span>DEVICE</span>
            <strong>DEVICE-001</strong>
          </div>

          <div className="transaction-meta">
            <span>TYPE</span>
            <strong>TRANSFER</strong>
          </div>

          {(stage === "IDLE" || stage === "ERROR") && (
            <button className="primary-button" onClick={runTransaction}>
              ANALYZE TRANSACTION
            </button>
          )}
        </div>

        {/* Risk */}
        <div className="sentinel-card risk-card">
          <div className="card-title">RISK INTELLIGENCE</div>

          {transaction ? (
            <>
              <div className="risk-score">
                <div className="risk-number">{riskScore}%</div>

                <div>
                  <div className="risk-level">
                    {transaction.backend_risk.level}
                  </div>

                  <div className="risk-label">
                    Contextual Risk Score
                  </div>
                </div>
              </div>

              <div className="risk-bar">
                <div
                  className="risk-fill"
                  style={{ width: `${riskScore}%` }}
                />
              </div>

              <div className="reason-list">
                {transaction.backend_risk.reasons.map((reason) => (
                  <div className="reason" key={reason.code}>
                    <span>⚠</span>
                    <div>
                      <strong>{reason.code.replaceAll("_", " ")}</strong>
                      <p>{reason.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              Risk analysis will appear here.
            </div>
          )}
        </div>

        {/* Security Pipeline */}
        <div className="sentinel-card pipeline-card">
          <div className="card-title">SECURITY PIPELINE</div>

          <PipelineStep
            label="Transaction Analysis"
            active={stage !== "IDLE"}
            complete={
              stage !== "IDLE" &&
              stage !== "ANALYZING" &&
              stage !== "ERROR"
            }
          />

          <PipelineStep
            label="Signed QR Payload"
            active={[
              "QR_GENERATED",
              "HARDWARE",
              "APPROVAL",
              "APPROVED",
              "EXECUTED",
            ].includes(stage)}
            complete={[
              "HARDWARE",
              "APPROVAL",
              "APPROVED",
              "EXECUTED",
            ].includes(stage)}
          />

          <PipelineStep
            label="Hardware Verification"
            active={[
              "HARDWARE",
              "APPROVAL",
              "APPROVED",
              "EXECUTED",
            ].includes(stage)}
            complete={["APPROVAL", "APPROVED", "EXECUTED"].includes(stage)}
          />

          <PipelineStep
            label="Authorization"
            active={["APPROVAL", "APPROVED", "EXECUTED"].includes(stage)}
            complete={["APPROVED", "EXECUTED"].includes(stage)}
          />

          <PipelineStep
            label="Execution"
            active={stage === "EXECUTED"}
            complete={stage === "EXECUTED"}
          />
        </div>

        {/* Action panel */}
        <div className="sentinel-card action-card">
          <div className="card-title">SECURITY ACTION</div>

          {stage === "ANALYZING" && (
            <div className="action-message">
              <div className="spinner" />
              <strong>Analyzing transaction context...</strong>
              <span>Checking behavioural risk signals</span>
            </div>
          )}

          {stage === "QR_GENERATED" && transaction && (
            <div className="action-message">
              <div className="action-icon">▣</div>
              <strong>Signed QR Payload Ready</strong>
              <span>
                Complete transaction context secured for hardware
                verification.
              </span>

              <button
                className="primary-button"
                onClick={verifyHardware}
              >
                SIMULATE HARDWARE SCAN
              </button>
            </div>
          )}

          {stage === "APPROVAL" && (
            <div className="action-message">
              <div className="action-icon">🔐</div>
              <strong>Hardware Verified</strong>
              <span>
                Signature and payload integrity confirmed.
              </span>

              <button
                className="primary-button"
                onClick={approveTransaction}
              >
                AUTHORIZE TRANSACTION
              </button>
            </div>
          )}

          {stage === "APPROVED" && (
            <div className="action-message">
              <div className="action-icon">✓</div>
              <strong>Transaction Approved</strong>
              <span>
                Hardware authorization accepted. Execution is now
                permitted.
              </span>

              <button
                className="primary-button"
                onClick={executeTransaction}
              >
                EXECUTE SIMULATION
              </button>
            </div>
          )}

          {stage === "EXECUTED" && (
            <div className="success-state">
              <div className="success-icon">✓</div>

              <strong>TRANSACTION EXECUTED</strong>

              <span>
                SentinelVault security checks completed successfully.
              </span>

              {transaction && (
                <small>{transaction.transaction_id}</small>
              )}
            </div>
          )}

          {stage === "IDLE" && (
            <div className="empty-state">
              Start a transaction to activate the security pipeline.
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
      </div>

      {transaction && (
        <div className="sentinel-footer">
          <span>
            TRANSACTION ID: <strong>{transaction.transaction_id}</strong>
          </span>

          <span>
            QR PROTOCOL: <strong>SV-QR-1.0</strong>
          </span>

          <span>
            EXPIRY:{" "}
            <strong>
              {new Date(transaction.expires_at).toLocaleTimeString()}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

function PipelineStep({
  label,
  active,
  complete,
}: {
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className={`pipeline-step ${active ? "active" : ""}`}>
      <div className={`pipeline-dot ${complete ? "complete" : ""}`}>
        {complete ? "✓" : ""}
      </div>

      <span>{label}</span>

      <small>
        {complete ? "VERIFIED" : active ? "ACTIVE" : "PENDING"}
      </small>
    </div>
  );
}