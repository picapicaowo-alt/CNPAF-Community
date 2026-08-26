import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: ["@cnpaf/shared", "@cnpaf/db"],
  serverExternalPackages: ["postgres", "bcryptjs", "@aws-sdk/client-s3"],
};

export default nextConfig;
