import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg.wasm runs only in the browser; keep it out of server bundles.
  serverExternalPackages: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
};

export default nextConfig;
