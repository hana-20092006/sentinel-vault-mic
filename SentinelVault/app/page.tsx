"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getTransactions, getBalance } from "../lib/api";
import { detectWalletChain } from "../lib/wallet-detection";
import DashboardLayout from "./components/DashboardLayout";
import WalletInput from "./components/WalletInput";
import WalletInfo from "./components/WalletInfo";
import CreateTransaction from "./components/CreateTransaction";
import ScanAndBroadcast from "./components/ScanAndBroadcast";
import TransactionList from "./components/TransactionList";
import PortfolioHealth from "./components/PortfolioHealth";
import VaultStatus from "./components/VaultStatus";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();

  // State declarations
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [txs, setTxs] = useState<any>({});
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [chainLocked, setChainLocked] = useState(false);
  const walletInputRef = useRef<HTMLDivElement>(null);
  const hasAutoLoaded = useRef(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  // Auto-load wallet from user's public_key on login
  useEffect(() => {
    if (
      !authLoading &&
      isAuthenticated &&
      user?.public_key &&
      !hasAutoLoaded.current &&
      !address
    ) {
      hasAutoLoaded.current = true;
      const walletInfo = detectWalletChain(user.public_key);

      if (walletInfo.isValid) {
        handleLoad(walletInfo.chain, walletInfo.address, true);
      }
    }
  }, [authLoading, isAuthenticated, user]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin size-12 border-4 border-slate-700 border-t-blue-500 rounded-full"></div>
          <p className="text-slate-400 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Handle wallet loading
  const handleLoad = async (
    selectedChain: string,
    addr: string,
    lockChain: boolean = false
  ) => {
    setChain(selectedChain);
    setAddress(addr);
    setLoading(true);
    setLoadError("");
    setChainLocked(lockChain);

    try {
      const [txData, bal] = await Promise.all([
        getTransactions(selectedChain, addr),
        getBalance(selectedChain, addr),
      ]);

      setTxs(txData);
      setBalance(bal);
    } catch (err: any) {
      console.error("Failed to load wallet data:", err);
      setLoadError(
        err.message ||
          "Failed to load wallet data. Please check the address and try again."
      );
      setAddress("");
      setChainLocked(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWallet = () => {
    setTimeout(() => {
      walletInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  };

  return (
    <DashboardLayout onConnectWallet={handleConnectWallet}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: "var(--spacing-6)",
          alignItems: "start",
        }}
        className="responsive-grid"
      >
        <style>{`
          @media (max-width: 768px) {
            .responsive-grid {
              grid-template-columns: 1fr !important;
              gap: var(--spacing-4) !important;
            }
          }
        `}</style>
        {/* ── Left Column ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-6)",
          }}
        >
          {/* Wallet Input - only show if no wallet is loaded */}
          {!address && (
            <div ref={walletInputRef} className="animate-fade-in">
              <WalletInput onSubmit={(c: string, a: string) => handleLoad(c, a, true)} loading={loading} />
            </div>
          )}

          {/* Error banner */}
          {loadError && (
            <div
              style={{
                background: "rgba(255, 56, 56, 0.1)",
                color: "var(--error)",
                padding: "var(--spacing-4)",
                borderRadius: "var(--radius-lg)",
                fontFamily: "var(--font-body)",
                fontSize: "0.8125rem",
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-3)",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20 }}
              >
                error
              </span>
              <span>{loadError}</span>
            </div>
          )}

          {/* Balance Card */}
          <WalletInfo
            address={address}
            balance={balance}
            txCount={txs?.normal?.length ?? 0}
            chain={chain}
          />

          {/* Initiate Transfer – chain and from address are locked */}
          <CreateTransaction
            chain={chain}
            sender={address}
            chainLocked={chainLocked}
          />

          {/* Broadcast Signed TX */}
          <ScanAndBroadcast />
        </div>

        {/* ── Right Column ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-6)",
          }}
        >
          {/* Portfolio Health */}
          <PortfolioHealth />

          {/* Recent Activity */}
          <TransactionList txs={txs} chain={chain} address={address} />

          {/* Vault Status */}
          <VaultStatus address={address} />
        </div>
      </div>
    </DashboardLayout>
  );
}