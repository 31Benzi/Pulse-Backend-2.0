import type { Context, Next } from "hono";
import { validateToken } from "../utils/tokens";
import { sendError } from "../utils/helpers";

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    //console.log(`[auth] No/invalid Authorization header for ${c.req.path}`);
    return sendError(
      c,
      "errors.com.exlo.common.authorization_failed",
      `Authorization failed for ${c.req.path}`,
      [c.req.path],
      1032,
      null,
      401
    );
  }

  const token = authHeader.slice(7).trim();

  const { valid, accountId, claims } = await validateToken(token);

  if (!valid || !accountId) {
    //console.log(`[auth] Token validation failed for ${c.req.path} | token prefix: ${token.slice(0, 20)}...`);
    return sendError(
      c,
      "errors.com.exlo.common.authorization_failed",
      `Authorization failed for ${c.req.path}`,
      [c.req.path],
      1032,
      null,
      401
    );
  }

  c.set("accountId", accountId);
  c.set("token", token);
  c.set("claims", claims);

  await next();
}
