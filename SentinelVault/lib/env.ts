/**
 * Environment configuration - centralized RPC endpoints and API keys
 * Supports fallbacks and mainnet/testnet switching
 */

export type Network = "mainnet" | "testnet";
export type FeeSpeed = "slow" | "normal" | "fast";

export const config = {
  network: (process.env.NEXT_PUBLIC_NETWORK || "mainnet") as Network,

  ethereum: {
    rpc: process.env.NEXT_PUBLIC_ETH_RPC || "https://rpc.ankr.com/eth",
    fallbackRpc: "https://eth.meowrpc.com",
    chainId: 1,
    etherscanKey: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || "",
    etherscanUrl: "https://api.etherscan.io",
  },

  bitcoin: {
    blockscanUrl: "https://blockchain.info",
    blockstreamUrl: "https://blockstream.info/api",
    mempoolUrl: "https://mempool.space/api",
    dustThreshold: 546, // satoshis
  },

  solana: {
    rpc: process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com",
    fallbackRpc: "https://solana-api.projectserum.com",
    commitment: "confirmed" as const,
  },

  limits: {
    txLimit: 50, // Fetch limit per request
    retries: 3,
    retryDelay: 1000, // ms
    timeout: 30000, // ms
  },
};

export const FEE_MULTIPLIERS: Record<FeeSpeed, number> = {
  slow: 0.8,
  normal: 1.0,
  fast: 1.5,
};

export function getFeeMultiplier(speed: FeeSpeed): number {
  return FEE_MULTIPLIERS[speed];
}
