import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller client bundles: tree-shake icon exports (many routes import lucide-react).
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
