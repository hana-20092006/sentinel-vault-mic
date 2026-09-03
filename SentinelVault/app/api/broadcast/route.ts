import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import { Connection } from "@solana/web3.js";
import { config } from "../../../lib/env";

/**
 * POST /api/broadcast
 * Body: { chain, payload, encoding }
 * Broadcasts a signed transaction to the appropriate network.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chain, payload, encoding } = body as {
      chain?: string;
      payload?: string;
      encoding?: string;
    };

    // Validate inputs
    if (!chain) {
      return NextResponse.json({ error: "Missing 'chain' parameter" }, { status: 400 });
    }

    if (!payload) {
      return NextResponse.json({ error: "Missing 'payload' parameter" }, { status: 400 });
    }

    // ── Ethereum ──────────────────────────────────────────────────────────
    if (chain === "ethereum") {
      try {
        const provider = new ethers.JsonRpcProvider(config.ethereum.rpc);
        const tx = await provider.broadcastTransaction(payload);
        return NextResponse.json({ txHash: tx.hash, chain });
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
          { error: `Ethereum broadcast failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // ── Bitcoin ───────────────────────────────────────────────────────────
    if (chain === "bitcoin") {
      try {
        let rawHex: string;

        if (encoding === "base64_psbt") {
          const psbt = bitcoin.Psbt.fromBase64(payload);
          psbt.finalizeAllInputs();
          rawHex = psbt.extractTransaction().toHex();
        } else {
          rawHex = payload;
        }

        const res = await fetch(`${config.bitcoin.blockstreamUrl}/tx`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: rawHex,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Blockstream rejected: ${errText}`);
        }

        const txid = await res.text();
        return NextResponse.json({ txHash: txid.trim(), chain });
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
          { error: `Bitcoin broadcast failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // ── Solana ────────────────────────────────────────────────────────────
    if (chain === "solana") {
      try {
        const connection = new Connection(config.solana.rpc, config.solana.commitment);
        const buf = Buffer.from(payload, "base64");
        const sig = await connection.sendRawTransaction(buf);
        return NextResponse.json({ txHash: sig, chain });
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json(
          { error: `Solana broadcast failed: ${error}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: `Unsupported chain: ${chain}` },
      { status: 400 }
    );
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Request error: ${error}` }, { status: 500 });
  }
}
