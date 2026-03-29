import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

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
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
      css: true
    }
  };
});
