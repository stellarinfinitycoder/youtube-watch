import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { execSync } from "node:child_process";
import {
  fetchLatestVideos,
  fetchViewCountsByVideoIds,
  getLatestVideosAndChannelByHandle,
  normalizeHandle,
  resolveChannelByHandleWithThumbnail
} from "./api/_lib/youtube";

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

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function parseLimit(raw: string | null): number {
  const parsed = Number(raw ?? 25);
  if (!Number.isFinite(parsed)) {
    return 25;
  }
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (!process.env.YOUTUBE_API_KEY) {
    process.env.YOUTUBE_API_KEY = env.YOUTUBE_API_KEY || env.VITE_YOUTUBE_API_KEY;
  }
  const buildEnv = mode === "production" ? "PROD" : "DEV";
  const buildCommitSha = getShortCommitSha();

  return {
    define: {
      __APP_BUILD_ENV__: JSON.stringify(buildEnv),
      __APP_COMMIT_SHA__: JSON.stringify(buildCommitSha)
    },
    plugins: [
      react(),
      {
        name: "youtube-api-dev-routes",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            try {
              const method = req.method ?? "GET";
              const origin = "http://localhost";
              const url = new URL(req.url ?? "/", origin);

              if (!url.pathname.startsWith("/api/youtube/")) {
                next();
                return;
              }

              if (!process.env.YOUTUBE_API_KEY) {
                sendJson(res, 500, {
                  error:
                    "Missing YOUTUBE_API_KEY for dev API routes. Set YOUTUBE_API_KEY in .env."
                });
                return;
              }

              if (url.pathname === "/api/youtube/latest" && method === "GET") {
                const handle = normalizeHandle(url.searchParams.get("handle") ?? "");
                const limit = parseLimit(url.searchParams.get("limit"));
                const data = await getLatestVideosAndChannelByHandle(handle, limit);
                sendJson(res, 200, data);
                return;
              }

              if (url.pathname === "/api/youtube/resolve" && method === "GET") {
                const handle = normalizeHandle(url.searchParams.get("handle") ?? "");
                const data = await resolveChannelByHandleWithThumbnail(handle);
                sendJson(res, 200, data);
                return;
              }

              if (url.pathname === "/api/youtube/latest-by-channel" && method === "GET") {
                const channelId = (url.searchParams.get("channelId") ?? "").trim();
                if (!channelId) {
                  sendJson(res, 400, { error: "channelId is required." });
                  return;
                }
                const limit = parseLimit(url.searchParams.get("limit"));
                const videos = await fetchLatestVideos(channelId, limit);
                sendJson(res, 200, { videos });
                return;
              }

              if (
                url.pathname === "/api/youtube/view-counts" &&
                (method === "POST" || method === "GET")
              ) {
                let videoIds: string[] = [];
                if (method === "POST") {
                  const rawBody = await readRequestBody(req);
                  const parsed = rawBody ? (JSON.parse(rawBody) as { videoIds?: unknown }) : {};
                  videoIds = Array.isArray(parsed.videoIds)
                    ? parsed.videoIds.filter((id): id is string => typeof id === "string")
                    : [];
                } else {
                  videoIds = (url.searchParams.get("videoIds") ?? "")
                    .split(",")
                    .map((id) => id.trim())
                    .filter(Boolean);
                }

                const data = await fetchViewCountsByVideoIds(videoIds);
                sendJson(res, 200, data);
                return;
              }

              sendJson(res, 405, { error: "Method not allowed" });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Request failed.";
              const status = /not found/i.test(message) ? 404 : 400;
              sendJson(res, status, { error: message });
            }
          });
        }
      }
    ],
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/setupTests.ts",
      css: true
    }
  };
});
