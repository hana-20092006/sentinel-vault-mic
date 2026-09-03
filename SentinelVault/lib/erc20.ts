/**
 * ERC-20 Token support for Ethereum
 * Fetches and displays ERC-20 token balances from Etherscan
 */

import axios from "axios";

const ETHERSCAN_API = process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY || "";

export interface ERC20Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
}

/**
 * Fetch ERC-20 token balances for an Ethereum address
 * Uses Etherscan tokenlist endpoint
 */
export async function fetchERC20Tokens(
  ethAddress: string
): Promise<ERC20Token[]> {
  if (!ethAddress || ethAddress.length !== 42) {
    throw new Error("Invalid Ethereum address");
  }

  try {
    // Get token list for address from Etherscan
    const response = await axios.get(
      "https://api.etherscan.io/api",
      {
        params: {
          module: "account",
          action: "tokentx",
          address: ethAddress,
          startblock: 0,
          endblock: 99999999,
          sort: "desc",
          apikey: ETHERSCAN_API,
        },
        timeout: 10000,
      }
    );

    if (response.data.status !== "1") {
      return []; // No tokens found
    }

    const transactions = response.data.result || [];
    const tokenMap: Record<string, ERC20Token> = {};

    // Process token transfers to get unique tokens
    for (const tx of transactions) {
      const key = tx.contractAddress.toLowerCase();

      if (!tokenMap[key]) {
        tokenMap[key] = {
          address: tx.contractAddress,
          symbol: tx.tokenSymbol || "Unknown",
          name: tx.tokenName || "Unknown Token",
          decimals: parseInt(tx.tokenDecimal || "18"),
          balance: "0",
          balanceFormatted: "0",
        };
      }

      // Track balance changes
      if (tx.to.toLowerCase() === ethAddress.toLowerCase()) {
        const amount = BigInt(tx.value);
        const current = BigInt(tokenMap[key].balance || "0");
        tokenMap[key].balance = (current + amount).toString();
      } else if (tx.from.toLowerCase() === ethAddress.toLowerCase()) {
        const amount = BigInt(tx.value);
        const current = BigInt(tokenMap[key].balance || "0");
        tokenMap[key].balance = (current - amount).toString();
      }
    }

    // Format balances
    const tokens = Object.values(tokenMap).map((token) => {
      const decimals = token.decimals || 18;
      const balance = BigInt(token.balance || "0");
      const formatted = (
        Number(balance) /
        Math.pow(10, decimals)
      ).toFixed(6);

      return {
        ...token,
        balanceFormatted: formatted,
      };
    });

    return tokens.filter((t) => BigInt(t.balance) > 0n);
  } catch (error) {
    console.error("Failed to fetch ERC-20 tokens:", error);
    throw error;
  }
}

/**
 * Get current balance of a specific ERC-20 token
 * Uses contract call simulation (requires RPC)
 */
export async function getERC20Balance(
  tokenAddress: string,
  walletAddress: string
): Promise<string> {
  try {
    // For this implementation, we'd need to make an ERC-20 contract call
    // Using ethers.js or web3.js in a browser context
    // For now, return 0 as placeholder
    console.warn(
      "ERC-20 balance lookup requires browser context with ethers.js"
    );
    return "0";
  } catch (error) {
    console.error("Failed to get ERC-20 balance:", error);
    return "0";
  }
}
