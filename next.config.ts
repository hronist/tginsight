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
  /**
   * Cross-origin isolation so onnxruntime-web can use SharedArrayBuffer
   * and multi-threaded WASM. `credentialless` (not require-corp) keeps
   * Hugging Face / CDN model fetches working without CORP on every asset.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
