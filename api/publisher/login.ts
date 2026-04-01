import { issueAdminSession } from "../_lib/publisher-auth.js";

function parseBody(req: any): Record<string, unknown> {
  if (req.body && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === "string") {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const configuredPassword = String(process.env.PUBLISHER_ADMIN_PASSWORD ?? "").trim();
  if (!configuredPassword) {
    res.status(500).json({ error: "Missing PUBLISHER_ADMIN_PASSWORD." });
    return;
  }

  const body = parseBody(req);
  const password = typeof body.password === "string" ? body.password : "";
  if (password !== configuredPassword) {
    res.status(401).json({ error: "Invalid password." });
    return;
  }

  try {
    issueAdminSession(res);
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    res.status(500).json({ error: message });
  }
}
