import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cnpaf/shared", "@cnpaf/db"],
  serverExternalPackages: ["postgres", "bcryptjs"],
};

export default nextConfig;
