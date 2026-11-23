import type { NextConfig } from "next";
import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,
  output: "standalone",
  experimental: {
    serverActions: {
      // Requests may reach Domino through the showcase, whose host differs from Domino's own.
      allowedOrigins: ["games.vporel.com", "localhost:3001"],
    },
  },
};

export default nextConfig;
