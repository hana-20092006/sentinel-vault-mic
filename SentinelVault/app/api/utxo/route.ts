import { NextRequest, NextResponse } from "next/server";
import { config } from "../../../lib/env";
import { isValidBtcAddress } from "../../../lib/validators";

/**
 * GET /api/utxo?address=<btc_address>
 * Server-side proxy → Blockstream (avoids browser CORS restrictions).
 * Returns UTXOs enriched with rawTxHex for nonWitnessUtxo signing.
 */
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");

    if (!address) {
      return NextResponse.json(
        { error: "Missing 'address' query parameter" },
        { status: 400 }
      );
    }

    // Validate Bitcoin address format
    if (!isValidBtcAddress(address)) {
      return NextResponse.json(
        { error: "Invalid Bitcoin address format" },
        { status: 400 }
      );
    }

    // 1. Fetch UTXOs
    const utxoRes = await fetch(
      `${config.bitcoin.blockstreamUrl}/address/${encodeURIComponent(address)}/utxo`,
      { headers: { "User-Agent": "SentinelVault/1.0" } }
    );

    if (!utxoRes.ok) {
      throw new Error(`Blockstream returned ${utxoRes.status}`);
    }

    const utxos: Array<{ txid: string; vout: number; value: number }> =
      await utxoRes.json();

    if (!utxos.length) {
      return NextResponse.json([], { status: 200 });
    }

    // 2. Fetch raw tx hex for each unique txid
    const uniqueTxids = [...new Set(utxos.map((u) => u.txid))];
    const txHexMap: Record<string, string> = {};

    await Promise.all(
      uniqueTxids.map(async (txid) => {
        try {
          const r = await fetch(
            `${config.bitcoin.blockstreamUrl}/tx/${encodeURIComponent(txid)}/hex`
          );
          if (r.ok) {
            txHexMap[txid] = await r.text();
          }
        } catch (e) {
          console.error(`Failed to fetch raw tx for ${txid}:`, e);
        }
      })
    );

    // 3. Return enriched UTXOs
    const enriched = utxos.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      rawTxHex: txHexMap[u.txid] ?? "",
    }));

    return NextResponse.json(enriched, { status: 200 });
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Unknown error";
    console.error("UTXO endpoint error:", error);
    return NextResponse.json(
      { error: `Failed to fetch UTXOs: ${error}` },
      { status: 500 }
    );
  }
}
