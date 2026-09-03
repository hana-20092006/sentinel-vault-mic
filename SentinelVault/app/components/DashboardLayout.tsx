"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import { useAuth } from "@/lib/auth-context";

interface DashboardLayoutProps {
  children: React.ReactNode;
  onConnectWallet?: () => void;
}

const NAV_ITEMS = [
  { icon: "dashboard",        label: "Home",          href: "/" },
  { icon: "account_balance",  label: "Assets",        href: "/assets" },
  { icon: "receipt_long",     label: "History",       href: "/transactions" },
  { icon: "verified_user",    label: "Security",      href: "/security" },
];

export default function DashboardLayout({ children, onConnectWallet }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Check if the user has a theme preference saved
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      if (prefersLight) {
        setTheme("light");
        document.documentElement.setAttribute("data-theme", "light");
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  const handleMobileLogout = () => {
    setMobileMenuOpen(false);
    logout();
    router.push("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <style>{`
        .dashboard-sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 240px;
          z-index: 100;
        }
        
        .dashboard-main {
          flex: 1;
          margin-left: 240px;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        }

        .mobile-header {
          display: none;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem var(--spacing-4);
          background: rgba(var(--bg-surface-lowest-rgb, 11, 14, 20), 0.75);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--ghost-border);
          position: sticky;
          top: 0;
          z-index: 40;
        }

        .desktop-header {
          display: flex;
          align-items: center;
          padding: var(--spacing-4) var(--spacing-8);
          min-height: 56px;
        }

        .bottom-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 72px;
          background: rgba(29, 32, 38, 0.85); /* Matches surface-container roughly */
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--ghost-border);
          z-index: 50;
          padding-bottom: env(safe-area-inset-bottom);
        }

        .mobile-user-dropdown {
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
          left: 0;
          background: var(--bg-surface-lowest);
          border-bottom: 1px solid var(--ghost-border);
          padding: var(--spacing-3) var(--spacing-4);
          z-index: 39;
          animation: slideDown 0.2s ease;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 768px) {
          .dashboard-sidebar {
            display: none !important;
          }
          .dashboard-main {
            margin-left: 0 !important;
          }
          .dashboard-main main {
            padding: var(--spacing-4) !important;
          }
          .mobile-header {
            display: flex;
          }
          .desktop-header {
            display: none !important;
          }
          .bottom-nav {
            display: flex;
            justify-content: space-around;
            align-items: center;
          }
          .mobile-user-dropdown.open {
            display: block;
          }
        }
      `}</style>

      {/* Sidebar (Desktop Only) */}
      <div className="dashboard-sidebar">
        <Sidebar onConnectWallet={onConnectWallet} />
      </div>

      {/* Main area */}
      <div className="dashboard-main">
        
        {/* Mobile Header (Only visible on mobile) */}
        <header className="mobile-header" style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-lg)",
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 10px var(--primary-glow)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--bg-surface)" }}>
                shield
              </span>
            </div>
            <h1
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "1.125rem",
                fontWeight: 800,
                color: "var(--primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              SentinelVault
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <button
              onClick={toggleTheme}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.5rem",
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {theme === "dark" ? "light_mode" : "dark_mode"}
              </span>
            </button>

            {/* Mobile user menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: mobileMenuOpen ? "var(--primary-container)" : "transparent",
                border: "none",
                color: mobileMenuOpen ? "var(--primary)" : "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0.5rem",
                cursor: "pointer",
                borderRadius: "var(--radius-md)",
                transition: "all 0.2s ease",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                {mobileMenuOpen ? "close" : "person"}
              </span>
            </button>
          </div>

          {/* Mobile user dropdown */}
          <div className={`mobile-user-dropdown ${mobileMenuOpen ? "open" : ""}`}>
            {user && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-3)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      margin: 0,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Logged in as
                  </p>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--primary)",
                      fontWeight: 600,
                      margin: "0.125rem 0 0 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={user.email}
                  >
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={handleMobileLogout}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--spacing-2)",
                    padding: "0.5rem 0.875rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--error)",
                    background: "rgba(255, 56, 56, 0.1)",
                    color: "var(--error)",
                    fontFamily: "var(--font-label)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16 }}
                  >
                    logout
                  </span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Desktop Header (Only visible on desktop) */}
        <header className="desktop-header">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <span
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
              }}
            >
              Vault Overview
            </span>
          </div>
        </header>

        <main
          style={{
            flex: 1,
            padding: "var(--spacing-6) var(--spacing-8)",
          }}
        >
          {children}
        </main>

        <StatusBar />
        
        {/* Bottom Nav (Mobile Only) */}
        <nav className="bottom-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  width: "25%",
                  height: "100%",
                  color: isActive ? "var(--primary)" : "var(--text-muted)",
                  textDecoration: "none",
                }}
              >
                <span 
                  className="material-symbols-outlined" 
                  style={{ 
                    fontSize: 24,
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" 
                  }}
                >
                  {item.icon}
                </span>
                <span 
                  style={{ 
                    fontFamily: "var(--font-label)", 
                    fontSize: "0.625rem", 
                    fontWeight: isActive ? 600 : 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
