import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // I file JSON dei pedaggi Telepass possono essere grandi (migliaia di passaggi)
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};

export default nextConfig;
