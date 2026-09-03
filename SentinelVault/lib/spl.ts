/**
 * SPL Token support for Solana
 * Fetches and displays SPL token balances using Solana RPC
 */

import axios from "axios";

const MAINNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";

export interface SPLToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceFormatted: string;
}

export interface TokenAccount {
  pubkey: string;
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          owner: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmount: number;
            uiAmountString: string;
          };
        };
      };
    };
  };
}

/**
 * Fetch SPL token balances for a Solana address
 * Uses Solana RPC getTokenAccountsByOwner
 */
export async function fetchSPLTokens(solanaAddress: string): Promise<SPLToken[]> {
  if (!solanaAddress || solanaAddress.length < 32) {
    throw new Error("Invalid Solana address");
  }

  try {
    const response = await axios.post(
      MAINNET_RPC,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          solanaAddress,
          {
            programId: "TokenkegQfeZyiNwAJsyFbPVwwQQfsTT8r3yx3MU5R", // SPL Token Program
          },
          {
            encoding: "jsonParsed",
          },
        ],
      },
      {
        timeout: 10000,
        headers: { "Content-Type": "application/json" },
      }
    );

    const tokenAccounts: TokenAccount[] = response.data.result?.value || [];

    if (tokenAccounts.length === 0) {
      return [];
    }

    // Fetch token metadata for each unique mint
    const tokens: SPLToken[] = [];
    const mintSet = new Set<string>();

    for (const account of tokenAccounts) {
      const parsed = account.account.data.parsed?.info;
      if (!parsed) continue;

      const mint = parsed.mint;
      if (mintSet.has(mint)) continue;
      mintSet.add(mint);

      const token: SPLToken = {
        mint: mint,
        symbol: "SPL", // Would need metadata fetching for real symbol
        name: `Token ${mint.slice(0, 8)}...`,
        decimals: parsed.tokenAmount?.decimals || 6,
        balance: parsed.tokenAmount?.amount || "0",
        balanceFormatted: parsed.tokenAmount?.uiAmountString || "0",
      };

      // Only include tokens with balance > 0
      if (BigInt(token.balance || "0") > 0n) {
        tokens.push(token);
      }
    }

    return tokens;
  } catch (error) {
    console.error("Failed to fetch SPL tokens:", error);
    throw error;
  }
}

/**
 * Fetch SPL token metadata for symbol and name
 */
export async function fetchSPLTokenMetadata(
  mint: string
): Promise<{ symbol: string; name: string } | null> {
  try {
    // This would typically use Metaplex or token registry API
    // For now, return placeholder
    return {
      symbol: "SPL",
      name: `Token ${mint.slice(0, 8)}...`,
    };
  } catch (error) {
    console.error("Failed to fetch SPL token metadata:", error);
    return null;
  }
}

/**
 * Get balance of a specific SPL token
 */
export async function getSPLTokenBalance(
  solanaAddress: string,
  mint: string
): Promise<string> {
  try {
    const response = await axios.post(
      MAINNET_RPC,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          solanaAddress,
          {
            mint: mint,
          },
          {
            encoding: "jsonParsed",
          },
        ],
      },
      {
        timeout: 10000,
        headers: { "Content-Type": "application/json" },
      }
    );

    const accounts = response.data.result?.value || [];
    if (accounts.length === 0) return "0";

    const balance = accounts[0]?.account.data.parsed?.info?.tokenAmount?.amount || "0";
    return balance;
  } catch (error) {
    console.error("Failed to fetch SPL token balance:", error);
    return "0";
  }
}
