import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep a single Node build: Mode A (OpenRouter) is client-only;
  // Mode B uses /api/chat Route Handler for CORS proxying.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
