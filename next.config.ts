import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const basePath = isGitHubPages && repositoryName ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  // Keep Cloudflare-only database/worker modules out of the Vercel typecheck.
  // The public game uses only the app/components/lib surface.
  typescript: { tsconfigPath: "tsconfig.github.json" },
  ...(isGitHubPages
    ? {
        output: "export" as const,
        basePath,
        assetPrefix: basePath,
      }
    : {}),
};

export default nextConfig;
