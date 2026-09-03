/**
 * Utility functions to detect wallet type and blockchain from address
 */

import { isValidEthAddress, isValidBtcAddress, isValidSolanaAddress } from './validators';

export interface WalletInfo {
  chain: 'ethereum' | 'bitcoin' | 'solana';
  address: string;
  isValid: boolean;
}

/**
 * Detect which blockchain a wallet address belongs to
 */
export function detectWalletChain(address: string): WalletInfo {
  if (!address) {
    return { chain: 'ethereum', address, isValid: false };
  }

  const trimmedAddress = address.trim();

  // **Check Ethereum FIRST** (most specific format: 0x + 40 hex)
  if (isValidEthAddress(trimmedAddress)) {
    return {
      chain: 'ethereum',
      address: trimmedAddress,
      isValid: true,
    };
  }

  // Check Bitcoin addresses
  if (isValidBtcAddress(trimmedAddress)) {
    return {
      chain: 'bitcoin',
      address: trimmedAddress,
      isValid: true,
    };
  }

  // Check Solana addresses
  if (isValidSolanaAddress(trimmedAddress)) {
    return {
      chain: 'solana',
      address: trimmedAddress,
      isValid: true,
    };
  }

  // If it looks like it could be Ethereum format but is invalid
  if (trimmedAddress.startsWith('0x')) {
    return {
      chain: 'ethereum',
      address: trimmedAddress,
      isValid: false,
    };
  }

  // Default to Ethereum for unrecognized format
  return {
    chain: 'ethereum',
    address: trimmedAddress,
    isValid: false,
  };
}

/**
 * Get user-friendly chain name
 */
export function getChainName(chain: string): string {
  const chainNames: Record<string, string> = {
    ethereum: 'Ethereum',
    bitcoin: 'Bitcoin',
    solana: 'Solana',
  };
  return chainNames[chain] || 'Unknown';
}

/**
 * Get wallet emoji based on chain
 */
export function getChainEmoji(chain: string): string {
  const emojis: Record<string, string> = {
    ethereum: '⟠',
    bitcoin: '₿',
    solana: '◎',
  };
  return emojis[chain] || '💼';
}
