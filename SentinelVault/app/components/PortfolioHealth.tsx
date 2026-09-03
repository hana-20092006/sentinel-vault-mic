"use client";

import { useState, useEffect } from "react";
import { getExchangeRates, type ExchangeRates } from "../../lib/rates";

interface PricePoint {
  timestamp: number;
  price: number;
}

interface CryptoTrend {
  name: string;
  symbol: string;
  color: string;
  price: number;
  weeklyData: PricePoint[];
}

interface HistoricalResponse {
  bitcoin: PricePoint[];
  ethereum: PricePoint[];
  solana: PricePoint[];
}

export default function PortfolioHealth() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [trends, setTrends] = useState<CryptoTrend[]>([
    { name: "Bitcoin", symbol: "BTC", color: "var(--primary)", price: 0, weeklyData: [] },
    { name: "Ethereum", symbol: "ETH", color: "var(--primary-dim)", price: 0, weeklyData: [] },
    { name: "Solana", symbol: "SOL", color: "var(--tertiary)", price: 0, weeklyData: [] },
  ]);

  // Fetch historical data on mount
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        const response = await fetch("/api/history");
        const data: HistoricalResponse = await response.json();

        const rates = await getExchangeRates();

        setTrends([
          { name: "Bitcoin", symbol: "BTC", color: "var(--primary)", price: rates.bitcoin, weeklyData: data.bitcoin || [] },
          { name: "Ethereum", symbol: "ETH", color: "var(--primary-dim)", price: rates.ethereum, weeklyData: data.ethereum || [] },
          { name: "Solana", symbol: "SOL", color: "var(--tertiary)", price: rates.solana, weeklyData: data.solana || [] },
        ]);
      } catch (error) {
        console.error("Failed to fetch historical data:", error);
      }
    };

    fetchHistoricalData();
  }, []);

  // Auto-rotate every 5 seconds
  useEffect(() => {
    const rotationInterval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(rotationInterval);
  }, []);

  const currentTrend = trends[currentIndex];
  const history = currentTrend.weeklyData || [];
  const prices = history.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  // Get the actual current price from latest historical data point
  const displayPrice = history.length > 0 ? history[history.length - 1].price : currentTrend.price;

  // Calculate percentage change from 7 days ago to now
  const firstPrice = history.length > 0 ? history[0].price : displayPrice;
  const lastPrice = history.length > 0 ? history[history.length - 1].price : displayPrice;
  const percentChange = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isPositive = percentChange >= 0;

  // Generate SVG path for sparkline
  const generatePath = () => {
    if (history.length < 2) return "";

    const width = 300;
    const height = 100;
    const padding = 10;

    const points = history.map((point, index) => {
      const price = point.price;
      const x = padding + (index / (history.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((price - minPrice) / priceRange) * (height - 2 * padding);
      return `${x},${y}`;
    });

    return `M ${points.join(" L ")}`;
  };

  return (
    <div
      className="card"
      style={{
        position: "relative",
        background: "var(--bg-surface-container)",
        overflow: "hidden",
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .crypto-price-display {
            font-size: 1.5rem !important;
          }
          .crypto-header {
            font-size: 0.8125rem !important;
          }
          .chart-container {
            height: 80px !important;
          }
        }
      `}</style>
      {/* Header */}
      <div
        style={{
          marginBottom: "var(--spacing-6)",
        }}
      >
        <h3
          className="crypto-header"
          style={{
            fontFamily: "var(--font-headline)",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
            marginBottom: "var(--spacing-2)",
          }}
        >
          Crypto Trends
        </h3>
        <p
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Auto-rotating price trends
        </p>
      </div>

      {/* Current Trend Display */}
      <div
        style={{
          background: "var(--bg-surface-lowest)",
          padding: "var(--spacing-4)",
          borderRadius: "var(--radius-lg)",
          marginBottom: "var(--spacing-6)",
        }}
      >
        {/* Crypto Name and Price */}
        <div style={{ marginBottom: "var(--spacing-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: currentTrend.color,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {currentTrend.name} ({currentTrend.symbol})
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "var(--spacing-3)" }}>
            <span
              className="crypto-price-display"
              style={{
                fontFamily: "var(--font-headline)",
                fontSize: "1.875rem",
                fontWeight: 700,
                color: "var(--primary)",
              }}
            >
              ${displayPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              style={{
                fontFamily: "var(--font-label)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: isPositive ? "var(--success)" : "var(--error)",
              }}
            >
              {isPositive ? "+" : ""}{percentChange.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Sparkline Chart */}
        {history.length > 1 && (
          <svg
            className="chart-container"
            width="100%"
            height="100"
            style={{
              marginBottom: "var(--spacing-3)",
              display: "block",
            }}
          >
            {/* Grid lines */}
            <line x1="0" y1="25%" x2="100%" y2="25%" stroke="var(--ghost-border)" strokeWidth="1" opacity="0.5" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="var(--ghost-border)" strokeWidth="1" opacity="0.5" />
            <line x1="0" y1="75%" x2="100%" y2="75%" stroke="var(--ghost-border)" strokeWidth="1" opacity="0.5" />
            
            {/* Price line */}
            <path
              d={generatePath()}
              stroke={currentTrend.color}
              fill="none"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {/* Area under line */}
            <defs>
              <linearGradient id="priceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={currentTrend.color} stopOpacity="0.1" />
                <stop offset="100%" stopColor={currentTrend.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${generatePath()} L 100,100 L 0,100 Z`}
              fill="url(#priceGradient)"
            />
          </svg>
        )}

        <p
          style={{
            fontFamily: "var(--font-label)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            margin: 0,
            textAlign: "center",
          }}
        >
          7-Day Price History ({history.length} hourly data points)
        </p>
      </div>

      {/* Rotation Indicators */}
      <div style={{ display: "flex", gap: "var(--spacing-2)", justifyContent: "center" }}>
        {trends.map((_, index) => (
          <div
            key={index}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: currentIndex === index ? "var(--primary)" : "var(--ghost-border)",
              transition: "background 200ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
