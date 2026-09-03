export interface EnrichedUtxo {
  txid: string;
  vout: number;
  value: number;       // satoshis
  rawTxHex: string;   // full raw tx hex for nonWitnessUtxo
}

export async function fetchUtxos(address: string): Promise<EnrichedUtxo[]> {
  const res = await fetch(`/api/utxo?address=${encodeURIComponent(address)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to fetch UTXOs");
  }
  return res.json();
}