import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { configDefaults } from "vitest/config";

function getShortCommitSha(): string {
  const vercelSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VITE_VERCEL_GIT_COMMIT_SHA ??
    "";
  if (vercelSha.trim().length > 0) {
    return vercelSha.trim().slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig(({ mode }) => {
  const buildEnv = mode === "production" ? "PROD" : "DEV";
  const buildCommitSha = getShortCommitSha();

  return {
    define: {
      __APP_BUILD_ENV__: JSON.stringify(buildEnv),
      __APP_COMMIT_SHA__: JSON.stringify(buildCommitSha)
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/antd") || id.includes("node_modules/@ant-design")) {
              return "antd-vendor";
            }
            if (id.includes("node_modules/react-markdown") || id.includes("node_modules/remark-gfm")) {
              return "markdown-vendor";
            }
            if (
              id.includes("/src/pages/PublisherAdminPage.tsx") ||
              id.includes("/src/pages/PublicNewsPage.tsx") ||
              id.includes("/src/api/publisher.ts") ||
              id.includes("/src/api/publisherPublish.ts") ||
              id.includes("/src/types/publisher.ts")
            ) {
              return "publisher";
            }
            return undefined;
          }
        }
      }
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
      css: true,
      exclude: [...configDefaults.exclude, "tests/**"]
    }
  };
});
