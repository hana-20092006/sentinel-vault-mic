import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve("buffer/"),
        stream: false,
        crypto: false,
        process: false,
        path: false,
        fs: false,
      };
      // Provide Buffer globally (needed by bitcoinjs-lib + @solana/web3.js in browser)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const webpack = require("webpack");
      config.plugins.push(
        new webpack.ProvidePlugin({ Buffer: ["buffer", "Buffer"] })
      );
    }
    return config;
  },
};

export default nextConfig;
