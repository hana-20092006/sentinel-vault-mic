export interface SignedQRPayload {
  chain: "ethereum" | "bitcoin" | "solana";
  type: "signed_tx";
  encoding: string;
  payload: string;
  timestamp?: number;
}

const SUPPORTED_CHAINS = ["ethereum", "bitcoin", "solana"] as const;

export function decodeQR(qrString: string): SignedQRPayload {
  let data: any;
  try {
    data = JSON.parse(qrString);
  } catch {
    throw new Error("Invalid QR — must be valid JSON.");
  }

  if (!data.chain) throw new Error("QR payload missing 'chain' field.");
  if (!data.payload) throw new Error("QR payload missing 'payload' field.");

  if (!SUPPORTED_CHAINS.includes(data.chain)) {
    throw new Error(`Unsupported chain: "${data.chain}".`);
  }

  if (data.type === "unsigned_tx") {
    throw new Error(
      "This QR is an UNSIGNED transaction. Sign it on your air-gapped device first, then scan the signed QR here."
    );
  }

  if (data.type !== "signed_tx") {
    throw new Error(`Unexpected QR type: "${data.type}". Expected "signed_tx".`);
  }

  return data as SignedQRPayload;
}