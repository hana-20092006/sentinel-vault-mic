"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { decodeQR } from "../../lib/qrDecode";
import type { SignedQRPayload } from "../../lib/qrDecode";

type ScanState = "idle" | "scanning" | "scanned" | "broadcasting" | "done" | "error";

const SCANNER_DIV = "sentinel-qr-scanner";

const EXPLORER: Record<string, (h: string) => string> = {
  ethereum: (h) => `https://etherscan.io/tx/${h}`,
  bitcoin: (h) => `https://mempool.space/tx/${h}`,
  solana: (h) => `https://solscan.io/tx/${h}`,
};

export default function ScanAndBroadcast() {
  const [mode, setMode] = useState<"camera" | "paste">("paste");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [pasteValue, setPasteValue] = useState("");
  const [decoded, setDecoded] = useState<SignedQRPayload | null>(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const scannerRef = useRef<any>(null);

  const safeStopScanner = useCallback((scannerObj: any) => {
    if (!scannerObj) return;
    try {
      // Safely check state. State 2 is SCANNING in html5-qrcode.
      // We only want to stop if it's actively scanning.
      const state = scannerObj.getState?.();
      if (state === 2) {
        scannerObj.stop().catch(() => {});
      }
    } catch (e) {
      // Ignore synchronous errors if the scanner is already stopped or paused
    }
  }, []);

  const handleDecoded = useCallback((raw: string) => {
    try {
      const data = decodeQR(raw.trim());
      setDecoded(data);
      setScanState("scanned");
    } catch (e: any) {
      setError(e.message);
      setScanState("error");
    }
  }, []);

  const reset = useCallback(() => {
    safeStopScanner(scannerRef.current);
    setScanState("idle");
    setDecoded(null);
    setTxHash("");
    setError("");
    setPasteValue("");
  }, []);

  useEffect(() => {
    if (scanState !== "scanning" || mode !== "camera") return;
    let active = true;
    let scanner: any;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        scanner = new Html5Qrcode(SCANNER_DIV);
        scannerRef.current = scanner;
        if (!active) return;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (text: string) => {
            handleDecoded(text);
            safeStopScanner(scanner);
          },
          () => {}
        );
      } catch (e: any) {
        if (active) {
          setError("Camera error: " + e.message);
          setScanState("error");
        }
      }
    })();

    return () => {
      active = false;
      safeStopScanner(scanner);
    };
  }, [scanState, mode, handleDecoded, safeStopScanner]);

  const handleBroadcast = async () => {
    if (!decoded) return;
    setScanState("broadcasting");
    setError("");
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: decoded.chain,
          payload: decoded.payload,
          encoding: decoded.encoding,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Broadcast failed");
      setTxHash(result.txHash);
      setScanState("done");
    } catch (e: any) {
      setError(e.message);
      setScanState("error");
    }
  };

  const isIdle = scanState === "idle";

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
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--primary)" }}>
            cell_tower
          </span>
          <h2
            style={{
              fontFamily: "var(--font-headline)",
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Broadcast Signed Transaction
          </h2>
        </div>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
            color: "var(--text-muted)",
            margin: "var(--spacing-2) 0 0",
          }}
        >
          After signing on your air-gapped device, scan or paste the signed QR to broadcast it.
        </p>
      </div>

      {/* Mode toggle */}
      {isIdle && (
        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          {(["camera", "paste"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-label)",
                fontSize: "0.8125rem",
                fontWeight: mode === m ? 600 : 400,
                background: mode === m ? "var(--primary)" : "var(--bg-surface-highest)",
                color: mode === m ? "var(--bg-base)" : "var(--text-muted)",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-2)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {m === "camera" ? "photo_camera" : "content_paste"}
              </span>
              {m === "camera" ? "Camera Scan" : "Paste Signed TX"}
            </button>
          ))}
        </div>
      )}

      {/* Camera mode */}
      {isIdle && mode === "camera" && (
        <button onClick={() => { setError(""); setScanState("scanning"); }} className="btn-primary" style={{ width: "100%" }}>
          Start Camera
        </button>
      )}

      {scanState === "scanning" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", margin: 0 }}>
            Point camera at the signed transaction QR code
          </p>
          <div
            id={SCANNER_DIV}
            style={{
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              minHeight: 320,
              border: "1px solid var(--ghost-border-focus)",
            }}
          />
          <button
            onClick={() => { safeStopScanner(scannerRef.current); setScanState("idle"); }}
            className="btn-ghost"
            style={{ color: "var(--error)" }}
          >
            ✕ Stop Camera
          </button>
        </div>
      )}

      {/* Paste mode */}
      {isIdle && mode === "paste" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
          <textarea
            rows={4}
            placeholder='Paste the signed transaction JSON here...'
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            style={{
              width: "100%",
              background: "var(--bg-surface-lowest)",
              border: "1px solid var(--ghost-border)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--spacing-3)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-label)",
              fontSize: "0.75rem",
              resize: "none",
            }}
          />
          <button
            onClick={() => { setError(""); handleDecoded(pasteValue); }}
            disabled={!pasteValue.trim()}
            className="btn-secondary"
            style={{ alignSelf: "flex-start" }}
          >
            Decode &amp; Preview
          </button>
        </div>
      )}

      {/* Scanned preview */}
      {scanState === "scanned" && decoded && (
        <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          <div
            style={{
              background: "var(--bg-surface-lowest)",
              borderRadius: "var(--radius-xl)",
              padding: "var(--spacing-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-3)",
            }}
          >
            <p style={{ color: "var(--tertiary)", fontFamily: "var(--font-label)", fontSize: "0.8125rem", fontWeight: 600, margin: 0 }}>
              ✅ Signed Transaction Decoded
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.25rem var(--spacing-4)", fontSize: "0.75rem" }}>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-label)" }}>Chain</span>
              <span style={{ color: "var(--text-primary)", textTransform: "capitalize" }}>{decoded.chain}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-label)" }}>Type</span>
              <span style={{ color: "var(--text-primary)" }}>{decoded.type}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-label)" }}>Encoding</span>
              <span style={{ color: "var(--text-primary)" }}>{decoded.encoding}</span>
            </div>
            <p style={{ fontFamily: "var(--font-label)", fontSize: "0.6875rem", color: "var(--text-muted)", margin: 0, wordBreak: "break-all" }}>
              {decoded.payload.slice(0, 100)}…
            </p>
          </div>

          <div style={{ display: "flex", gap: "var(--spacing-3)", flexWrap: "wrap" }}>
            <button onClick={handleBroadcast} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rocket_launch</span>
              Broadcast to {decoded.chain.charAt(0).toUpperCase() + decoded.chain.slice(1)}
            </button>
            <button onClick={reset} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Broadcasting */}
      {scanState === "broadcasting" && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
          <div
            style={{
              width: 16,
              height: 16,
              border: "2px solid var(--primary)",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          Broadcasting transaction to the network…
        </div>
      )}

      {/* Success */}
      {scanState === "done" && decoded && (
        <div
          className="animate-fade-in"
          style={{
            background: "rgba(42, 229, 0, 0.08)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--spacing-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-2)",
          }}
        >
          <p style={{ color: "var(--tertiary)", fontWeight: 600, fontSize: "0.8125rem", margin: 0 }}>✅ Transaction Broadcast!</p>
          <p style={{ fontFamily: "var(--font-label)", fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0, wordBreak: "break-all" }}>
            {txHash}
          </p>
          <a
            href={EXPLORER[decoded.chain]?.(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--primary)", fontSize: "0.75rem", textDecoration: "none" }}
          >
            View on Explorer →
          </a>
          <button onClick={reset} className="btn-ghost" style={{ alignSelf: "flex-start", padding: 0, marginTop: "var(--spacing-1)" }}>
            ← Start over
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: "rgba(255, 180, 171, 0.08)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--spacing-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-2)",
          }}
        >
          <p style={{ color: "var(--error)", fontSize: "0.8125rem", margin: 0 }}>{error}</p>
          <button onClick={reset} className="btn-ghost" style={{ alignSelf: "flex-start", padding: 0 }}>Try again</button>
        </div>
      )}
    </div>
  );
}
