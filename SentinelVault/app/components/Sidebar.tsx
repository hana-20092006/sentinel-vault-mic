"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { icon: "dashboard",        label: "Dashboard",     href: "/" },
  { icon: "account_balance",  label: "Assets",        href: "/assets" },
  { icon: "receipt_long",     label: "Transactions",  href: "/transactions" },
  { icon: "verified_user",    label: "Security",      href: "/security" },
  { icon: "hub",              label: "Nodes",         href: "/nodes" },
];

interface SidebarProps {
  onConnectWallet?: () => void;
}

export default function Sidebar({ onConnectWallet }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    // Check if the user has a theme preference saved
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else {
      // Check system preference if no saved theme
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

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside
      style={{
        width: 240,
        minHeight: "100vh",
        background: "var(--bg-surface-lowest)",
        display: "flex",
        flexDirection: "column",
        padding: "var(--spacing-6) 0",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 50,
        transition: "background 0.3s ease",
        borderRight: "1px solid var(--ghost-border)", // Add crisp separator for light mode
      }}
    >
      {/* ── Brand ── */}
      <div style={{ padding: "0 var(--spacing-6)", marginBottom: "var(--spacing-8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-lg)",
              background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dim) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px var(--primary-glow)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--bg-surface)" }}>
              shield
            </span>
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "1rem",
                fontWeight: 800,
                color: "var(--primary)",
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              SentinelVault
            </h1>
            <p
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.625rem",
                color: "var(--text-muted)",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Digital Architect
            </p>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, padding: "0 var(--spacing-3)" }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-3)",
                padding: "0.625rem var(--spacing-4)",
                borderRadius: "var(--radius-lg)",
                marginBottom: "var(--spacing-1)",
                textDecoration: "none",
                transition: "background 0.2s ease, color 0.2s ease",
                background: isActive ? "var(--primary-container)" : "transparent",
                color: isActive ? "var(--primary)" : "var(--text-muted)",
                fontFamily: "var(--font-label)",
                fontSize: "0.8125rem",
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom section ── */}
      <div style={{ padding: "0 var(--spacing-4)" }}>
        {/* User Info */}
        {user && (
          <div
            style={{
              padding: "var(--spacing-3)",
              marginBottom: "var(--spacing-4)",
              borderRadius: "var(--radius-lg)",
              background: "var(--primary-container)",
              border: "1px solid var(--primary)",
            }}
          >
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginBottom: "0.25rem",
              }}
            >
              Logged in as:
            </p>
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--primary)",
                fontWeight: 600,
                wordBreak: "break-word",
              }}
              title={user.email}
            >
              {user.email.length > 20 ? user.email.substring(0, 17) + '...' : user.email}
            </p>
          </div>
        )}

        {/* Bottom Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-2)", marginBottom: "var(--spacing-4)" }}>
          <button
            onClick={toggleTheme}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
              justifyContent: "flex-start",
              padding: "0.5rem var(--spacing-2)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button
            onClick={handleLogout}
            className="btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-2)",
              justifyContent: "flex-start",
              padding: "0.5rem var(--spacing-2)",
              color: "var(--error)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              logout
            </span>
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
