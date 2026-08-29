import type { Context } from "hono";
import { getVersionInfo } from "../utils/helpers";

export async function checkVersion(c: Context) {
  const userAgent = c.req.header("user-agent") || "";
  const versionInfo = getVersionInfo(userAgent);

  return c.json({
    type: "NO_UPDATE"
  });
}

export async function waitingRoom(c: Context) {
  return c.body(null, 204);
}

export async function checkForUpdates(c: Context) {
  return c.json({
    requireUpdate: false,
    buildDate: new Date().toISOString()
  });
}
