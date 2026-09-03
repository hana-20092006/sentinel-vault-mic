import { NextRequest, NextResponse } from "next/server";
import { isValidBtcAddress } from "../../../lib/validators";

/**
 * GET /api/bitcoin?action=<transactions|balance>&address=<btc_address>&limit=<n>
 *
 * Server-side proxy for Bitcoin data.
 * Uses Blockstream API (primary) with blockchain.info fallback.
 * Avoids browser CORS restrictions and mempool.space reliability issues.
 */

const BLOCKSTREAM_API = "https://blockstream.info/api";
const BLOCKCHAIN_INFO_API = "https://blockchain.info";

// ─── Helpers ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Transactions (Blockstream primary → blockchain.info fallback) ─────

async function getTransactionsBlockstream(
  address: string,
  limit: number
): Promise<any[]> {
  const res = await fetchWithTimeout(
    `${BLOCKSTREAM_API}/address/${encodeURIComponent(address)}/txs`,
    { headers: { "User-Agent": "SentinelVault/1.0" } }
  );

  if (!res.ok) {
    throw new Error(`Blockstream returned ${res.status}`);
  }

  const txs: any[] = await res.json();

  // Blockstream returns max 25 txs per call. Map to a normalised shape.
  return txs.slice(0, limit).map((tx: any) => {
    // Determine sent/received values
    const inputAddresses = (tx.vin || []).map(
      (v: any) => v.prevout?.scriptpubkey_address || ""
    );
    const isSender = inputAddresses.some(
      (a: string) => a.toLowerCase() === address.toLowerCase()
    );

    // Find value going TO the target address across outputs
    let receivedValue = 0;
    let sentValue = 0;
    for (const vout of tx.vout || []) {
      const outAddr = vout.scriptpubkey_address || "";
      if (outAddr.toLowerCase() === address.toLowerCase()) {
        receivedValue += vout.value || 0;
      } else if (isSender) {
        sentValue += vout.value || 0;
      }
    }

    return {
      hash: tx.txid || "",
      from: isSender ? address : inputAddresses[0] || "unknown",
      to: isSender
        ? (tx.vout || []).find(
            (v: any) =>
              (v.scriptpubkey_address || "").toLowerCase() !==
              address.toLowerCase()
          )?.scriptpubkey_address || address
        : address,
      value: String(isSender ? sentValue : receivedValue), // satoshis
      timeStamp: String(tx.status?.block_time || 0),
      blockNumber: String(tx.status?.block_height || 0),
      confirmations: tx.status?.confirmed ? 1 : 0,
      fee: String(tx.fee || 0),
    };
  });
}

async function getTransactionsBlockchainInfo(
  address: string,
  limit: number
): Promise<any[]> {
  const res = await fetchWithTimeout(
    `${BLOCKCHAIN_INFO_API}/rawaddr/${encodeURIComponent(
      address
    )}?limit=${limit}&cors=true`,
    { headers: { "User-Agent": "SentinelVault/1.0" } }
  );

  if (!res.ok) {
    throw new Error(`blockchain.info returned ${res.status}`);
  }

  const data = await res.json();
  const txs: any[] = data.txs || [];

  return txs.slice(0, limit).map((tx: any) => {
    // Determine direction
    const inputAddresses = (tx.inputs || []).map(
      (i: any) => i.prev_out?.addr || ""
    );
    const isSender = inputAddresses.some(
      (a: string) => a.toLowerCase() === address.toLowerCase()
    );

    let receivedValue = 0;
    let sentValue = 0;
    for (const out of tx.out || []) {
      if ((out.addr || "").toLowerCase() === address.toLowerCase()) {
        receivedValue += out.value || 0;
      } else if (isSender) {
        sentValue += out.value || 0;
      }
    }

    return {
      hash: tx.hash || "",
      from: isSender ? address : inputAddresses[0] || "unknown",
      to: isSender
        ? (tx.out || []).find(
            (o: any) =>
              (o.addr || "").toLowerCase() !== address.toLowerCase()
          )?.addr || address
        : address,
      value: String(isSender ? sentValue : receivedValue),
      timeStamp: String(tx.time || 0),
      blockNumber: String(tx.block_height || 0),
      confirmations: tx.block_height ? 1 : 0,
      fee: String(tx.fee || 0),
    };
  });
}

// ─── Balance (Blockstream primary → blockchain.info fallback) ──────────

async function getBalanceBlockstream(address: string): Promise<any> {
  const res = await fetchWithTimeout(
    `${BLOCKSTREAM_API}/address/${encodeURIComponent(address)}`,
    { headers: { "User-Agent": "SentinelVault/1.0" } }
  );

  if (!res.ok) {
    throw new Error(`Blockstream returned ${res.status}`);
  }

  const data = await res.json();

  // chain_stats has confirmed values, mempool_stats has unconfirmed
  const funded = data.chain_stats?.funded_txo_sum || 0;
  const spent = data.chain_stats?.spent_txo_sum || 0;
  const mempoolFunded = data.mempool_stats?.funded_txo_sum || 0;
  const mempoolSpent = data.mempool_stats?.spent_txo_sum || 0;

  const confirmedBalance = funded - spent;
  const unconfirmedBalance = mempoolFunded - mempoolSpent;

  return {
    final_balance: confirmedBalance + unconfirmedBalance, // satoshis
    confirmed_balance: confirmedBalance,
    unconfirmed_balance: unconfirmedBalance,
    n_tx: (data.chain_stats?.tx_count || 0) + (data.mempool_stats?.tx_count || 0),
  };
}

async function getBalanceBlockchainInfo(address: string): Promise<any> {
  const res = await fetchWithTimeout(
    `${BLOCKCHAIN_INFO_API}/balance?active=${encodeURIComponent(
      address
    )}&cors=true`,
    { headers: { "User-Agent": "SentinelVault/1.0" } }
  );

  if (!res.ok) {
    throw new Error(`blockchain.info returned ${res.status}`);
  }

  const data = await res.json();
  const addrData = data[address] || {};

  return {
    final_balance: addrData.final_balance || 0,
    confirmed_balance: addrData.final_balance || 0,
    unconfirmed_balance: 0,
    n_tx: addrData.n_tx || 0,
  };
}

// ─── Route Handler ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const action = req.nextUrl.searchParams.get("action");
    const address = req.nextUrl.searchParams.get("address");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!address) {
      return NextResponse.json(
        { error: "Missing 'address' query parameter" },
        { status: 400 }
      );
    }

    if (!isValidBtcAddress(address)) {
      return NextResponse.json(
        { error: "Invalid Bitcoin address format" },
        { status: 400 }
      );
    }

    // ── Transactions ────────────────────────────────────────────────────
    if (action === "transactions") {
      let txs: any[] = [];
      let lastError: Error | null = null;

      // Try Blockstream first
      try {
        txs = await getTransactionsBlockstream(address, limit);
      } catch (e: any) {
        lastError = e;
        console.warn("Blockstream transactions failed:", e.message);

        // Fallback to blockchain.info
        try {
          txs = await getTransactionsBlockchainInfo(address, limit);
        } catch (e2: any) {
          lastError = e2;
          console.warn("blockchain.info transactions also failed:", e2.message);
        }
      }

      return NextResponse.json(
        { txs, source: lastError ? "fallback" : "blockstream" },
        { status: 200 }
      );
    }

    // ── Balance ─────────────────────────────────────────────────────────
    if (action === "balance") {
      let balanceData: any = null;
      let lastError: Error | null = null;

      // Try Blockstream first
      try {
        balanceData = await getBalanceBlockstream(address);
      } catch (e: any) {
        lastError = e;
        console.warn("Blockstream balance failed:", e.message);

        // Fallback to blockchain.info
        try {
          balanceData = await getBalanceBlockchainInfo(address);
        } catch (e2: any) {
          lastError = e2;
          console.warn("blockchain.info balance also failed:", e2.message);
        }
      }

      if (!balanceData) {
        return NextResponse.json(
          {
            final_balance: 0,
            confirmed_balance: 0,
            unconfirmed_balance: 0,
            n_tx: 0,
            error: lastError?.message || "All API sources failed",
          },
          { status: 200 } // Return 200 with zero balance instead of erroring
        );
      }

      return NextResponse.json(balanceData, { status: 200 });
    }

    return NextResponse.json(
      { error: `Unknown action: '${action}'. Use 'transactions' or 'balance'.` },
      { status: 400 }
    );
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : "Unknown error";
    console.error("Bitcoin API route error:", error);
    return NextResponse.json(
      { error: `Bitcoin API error: ${error}` },
      { status: 500 }
    );
  }
}
