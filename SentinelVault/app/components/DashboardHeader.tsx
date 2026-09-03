"use client";

export default function DashboardHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--spacing-4) var(--spacing-8)",
        background: "var(--bg-base)",
        minHeight: 56,
      }}
    >
      {/* ── Breadcrumbs ── */}
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
        {/* <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>/</span>
        <span
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.8125rem",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          Personal Account
        </span> */}
      </div>

      {/* ── Right section ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-4)" }}>
        {/* Search removed - not implemented */}
        {/* Icons removed - not implemented */}

        {/* Avatar */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--tertiary) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--bg-base)" }}>
            person
          </span>
        </div>
      </div>
    </header>
  );
}
