"use client";

import { useEffect, useRef } from "react";
// @ts-expect-error - qrcode has no type declarations
import QRCode from "qrcode";

export default function QRGenerator({
  data,
  title,
}: {
  data: string;
  title?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (data && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, data, { width: 200 });
    }
  }, [data]);

  if (!data) return null;

  return (
    <div
      style={{
        background: "white",
        borderRadius: "var(--radius-2xl)",
        padding: "var(--spacing-6)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {title && (
        <h3 style={{ fontFamily: "var(--font-headline)", fontWeight: 600, marginBottom: "var(--spacing-3)", color: "#000" }}>
          {title}
        </h3>
      )}
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}