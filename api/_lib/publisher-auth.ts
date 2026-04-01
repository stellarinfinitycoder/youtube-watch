import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "publisher_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  exp: number;
};

function getSessionSecret(): string {
  return String(process.env.PUBLISHER_SESSION_SECRET ?? "").trim();
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        if (index <= 0) {
          return [pair, ""];
        }
        return [pair.slice(0, index), pair.slice(index + 1)];
      })
  );
}

function appendSetCookie(res: any, value: string): void {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, value]);
    return;
  }
  res.setHeader("Set-Cookie", [String(current), value]);
}

function buildCookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function createSessionToken(secret: string): string {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded, secret);
  return `${payloadEncoded}.${signature}`;
}

function verifySessionToken(token: string, secret: string): boolean {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return false;
  }
  const expected = sign(payloadEncoded, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }
  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return false;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadEncoded)) as Partial<SessionPayload>;
    if (typeof payload.exp !== "number") {
      return false;
    }
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isAdminAuthenticated(req: any): boolean {
  const secret = getSessionSecret();
  if (!secret) {
    return false;
  }
  const cookies = parseCookies(req.headers?.cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return false;
  }
  return verifySessionToken(token, secret);
}

export function requireAdminSession(req: any, res: any): boolean {
  if (isAdminAuthenticated(req)) {
    return true;
  }
  res.status(401).json({ error: "Unauthorized." });
  return false;
}

export function issueAdminSession(res: any): void {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Missing PUBLISHER_SESSION_SECRET.");
  }
  const token = createSessionToken(secret);
  appendSetCookie(res, buildCookie(token, SESSION_MAX_AGE_SECONDS));
}

export function clearAdminSession(res: any): void {
  appendSetCookie(res, buildCookie("", 0));
}
