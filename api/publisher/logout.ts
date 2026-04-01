import { clearAdminSession } from "../_lib/publisher-auth.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  clearAdminSession(res);
  res.status(200).json({ ok: true });
}
