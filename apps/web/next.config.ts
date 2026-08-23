import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cnpaf/shared", "@cnpaf/db"],
  serverExternalPackages: ["postgres", "bcryptjs", "@aws-sdk/client-s3"],
};

export default nextConfig;
