import type { Context, Next } from "hono";
import { updateUserIp, isIpBanned, findToken } from "../db/queries";
import { validateToken } from "../utils/tokens";
import { sendError, logger } from "../utils/helpers";
import { trackActiveIp } from "../utils/activePlayers";

function getClientIp(c: Context): string {
  const bunIp = c.req.header("x-real-client-ip");
  if (bunIp && bunIp !== "unknown") {
    return bunIp;
  }
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = c.req.header("x-real-ip");
  if (realIp) {
    return realIp;
  }
  const cfIp = c.req.header("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }
  return "unknown";
}

export async function ipTrackingMiddleware(c: Context, next: Next) {
  const ip = getClientIp(c);
  c.set("clientIp", ip);

  logger.info(`[${c.req.method}] ${c.req.path} - ${ip}`);

  trackActiveIp(ip);

  const banned = await isIpBanned(ip);
  if (banned) {
    return sendError(
      c,
      "errors.com.exlo.common.ip_banned",
      "Your IP address has been banned.",
      [],
      1000,
      null,
      403
    );
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const { valid, accountId } = await validateToken(token);
    if (valid && accountId) {
      await updateUserIp(accountId, ip);
    }
  }

  await next();
}
