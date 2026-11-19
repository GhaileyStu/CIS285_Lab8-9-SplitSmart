import type { NextConfig } from "next";

const isCodespacesDevelopment =
  process.env.CODESPACES === "true" && process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  ...(isCodespacesDevelopment && {
    experimental: {
      serverActions: {
        allowedOrigins: ["localhost:3000"],
      },
    },
  }),
};

export default nextConfig;
