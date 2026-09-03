function getEncoding(chain: string): string {
  if (chain === "ethereum") return "hex";
  if (chain === "bitcoin") return "base64_psbt";
  if (chain === "solana") return "base64";
  return "unknown";
}

export function encodeQR({ chain, payload }: { chain: string; payload: string }) {
  return JSON.stringify({
    chain,
    type: "unsigned_tx",
    encoding: getEncoding(chain),
    payload,
    timestamp: Date.now(),
  });
}

/** Used by an air-gapped signer to wrap a signed tx as a QR payload. */
export function encodeSignedQR({ chain, payload }: { chain: string; payload: string }) {
  return JSON.stringify({
    chain,
    type: "signed_tx",
    encoding: getEncoding(chain),
    payload,
    timestamp: Date.now(),
  });
}