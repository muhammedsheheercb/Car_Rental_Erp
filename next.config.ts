import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = { experimental: { serverActions: { bodySizeLimit: "6mb" } } };

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
