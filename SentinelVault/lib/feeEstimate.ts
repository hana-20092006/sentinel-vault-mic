/**
 * Fee estimation and tier selection for all blockchains
 */

import { FeeSpeed, config, getFeeMultiplier } from "./env";

export interface FeeEstimate {
  slow: string;
  normal: string;
  fast: string;
  unit: string; // "gwei" for ETH, "sat/b" for BTC, "lamports" for SOL
  timestamp: number;
}

// ──── Ethereum ────────────────────────────────────────────────────────────

export async function getEthFeeEstimate(): Promise<FeeEstimate> {
  try {
    const response = await fetch(config.ethereum.etherscanUrl + `/api?module=gastracker&action=gasoracle&apikey=${config.ethereum.etherscanKey}`);
    const data = await response.json();

    if (data.status !== "1") {
      throw new Error("Failed to fetch gas prices");
    }

    const result = data.result;
    return {
      slow: result.SafeGasPrice,
      normal: result.StandardGasPrice,
      fast: result.FastGasPrice,
      unit: "gwei",
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn("Failed to fetch Etherscan gas prices, using fallback");
    // Fallback: typical mainnet gas prices
    return {
      slow: "20",
      normal: "25",
      fast: "35",
      unit: "gwei",
      timestamp: Date.now(),
    };
  }
}

export function selectEthFee(estimate: FeeEstimate, speed: FeeSpeed): string {
  const basePrice = estimate[speed];
  // For EIP-1559, we use maxFeePerGas directly
  return basePrice;
}

// ──── Bitcoin ────────────────────────────────────────────────────────────

export async function getBtcFeeEstimate(): Promise<FeeEstimate> {
  // Try Blockstream first (more reliable)
  try {
    const response = await fetch(config.bitcoin.blockstreamUrl + "/fee-estimates");
    const data = await response.json();

    // Blockstream returns { "1": rate, "2": rate, ... , "25": rate } (sat/vB for N-block target)
    const fast = data["1"] || data["2"] || 5;
    const normal = data["3"] || data["6"] || 2;
    const slow = data["6"] || data["25"] || 1;

    return {
      slow: Math.ceil(slow).toString(),
      normal: Math.ceil(normal).toString(),
      fast: Math.ceil(fast * 1.2).toString(),
      unit: "sat/b",
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn("Blockstream fee estimation failed, trying mempool.space");
  }

  // Fallback to mempool.space
  try {
    const response = await fetch(config.bitcoin.mempoolUrl + "/v1/fees/recommended");
    const data = await response.json();

    return {
      slow: data.hourFee?.toString() || "1",
      normal: data.fastestFee?.toString() || "2",
      fast: (data.fastestFee * 1.5).toString(),
      unit: "sat/b",
      timestamp: Date.now(),
    };
  } catch (e) {
    console.warn("All BTC fee APIs failed, using fallback");
    return {
      slow: "1",
      normal: "2",
      fast: "5",
      unit: "sat/b",
      timestamp: Date.now(),
    };
  }
}

export function selectBtcFee(estimate: FeeEstimate, speed: FeeSpeed): number {
  const baseRate = parseInt(estimate[speed]);
  const multiplier = getFeeMultiplier(speed);
  return Math.ceil(baseRate * multiplier);
}

// ──── Solana ────────────────────────────────────────────────────────────

export async function getSolFeeEstimate(): Promise<FeeEstimate> {
  try {
    // Solana fees are based on recent blockhash and programmatic fees
    // We'll use a static priority fee for now
    return {
      slow: "100000", // 0.0001 SOL
      normal: "200000", // 0.0002 SOL
      fast: "500000", // 0.0005 SOL
      unit: "lamports",
      timestamp: Date.now(),
    };
  } catch (e) {
    return {
      slow: "100000",
      normal: "200000",
      fast: "500000",
      unit: "lamports",
      timestamp: Date.now(),
    };
  }
}

export function selectSolFee(estimate: FeeEstimate, speed: FeeSpeed): number {
  return parseInt(estimate[speed]);
}

/**
 * Generic fee estimation
 */
export async function estimateFees(chain: string): Promise<FeeEstimate> {
  if (chain === "ethereum") {
    return getEthFeeEstimate();
  } else if (chain === "bitcoin") {
    return getBtcFeeEstimate();
  } else if (chain === "solana") {
    return getSolFeeEstimate();
  }
  throw new Error(`Unsupported chain: ${chain}`);
}
