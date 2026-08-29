import type { Context } from "hono";
import { findUserByAccountId, updateUser, deleteToken, findTokenByAccountId } from "../db/queries";
import { logger } from "../utils/helpers";

const arcKey = "HVIdvmfh3gzOWN89-YuiYyYa2A1fWVrDJFn7zGh5Hsw6xvXiJr6ngHfTW8X9kvM1X_qpOn4-nKF96HC0YEftcryB_AAfS1sckV1S3l87VbctOwxJGjr9Fg9WAaTy-3ti_6kxspEzzMh-EEOofa30XNyLHdzQSjqF13nbSFvJ0as2FZ0yQonvMxBTjfEnSVGVgBDcAkUXe98hKMutoSA0fMWzkZjOqU4Z9ctU7-uKFqHBr";

export async function arcBan(c: Context) {
  const arcAuth = c.req.header("X-Arc-Auth");
  if (!arcAuth || arcAuth !== arcKey) {
    logger.warn("Invalid key for arc");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return c.json({ error: "Invalid content type" }, 400);
  }

  let body: { id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const accountId = body.id;
  if (!accountId) {
    return c.json({ error: "No account id" }, 400);
  }

  const user = await findUserByAccountId(accountId);
  if (!user) {
    return c.json({ error: "Account not found" }, 404);
  }

  await updateUser(accountId, { banned: true });
  logger.info(`"${user.username}" (${accountId}) is banned`);

  return c.json({ success: true, message: `${accountId} has been banned` });
}

export async function arcRevoke(c: Context) {
  const arcAuth = c.req.header("X-Arc-Auth");
  if (!arcAuth || arcAuth !== arcKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return c.json({ error: "Invalid content type" }, 400);
  }

  let body: { id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const accountId = body.id;
  if (!accountId) {
    return c.json({ error: "No account id" }, 400);
  }

  const user = await findUserByAccountId(accountId);
  if (!user) {
    return c.json({ error: "Account not found" }, 404);
  }

  const token = await findTokenByAccountId(accountId);
  if (token?.accessToken) {
    await deleteToken(token.accessToken);
  }

  logger.info(`"${user.username}" (${accountId}) is revoked`);

  return c.json({ success: true, message: `${accountId} has been revoked` });

}

// manual bans stuff
export const deactivateUrl = "https://dev-anticheat-v1.arc-services.dev/router/v1/anticheat/public/deactivate";
export const banAuthKey = arcKey;
export const arcClientId = "nemqoixqnjtvdzpsdcgbeubsroxccwjh";

export async function arcDeactivate(c: Context) {
  const arcAuth = c.req.header("X-Arc-Auth");
  if (!arcAuth || arcAuth !== arcKey) {
    logger.warn("Invalid key for arc deactivate");
    return c.json({ error: "Unauthorized" }, 401);
  }

  const accountId = c.req.param("accountId");
  if (!accountId) {
    return c.json({ error: "No account id" }, 400);
  }

  const user = await findUserByAccountId(accountId);
  if (!user) {
    return c.json({ error: "Account not found" }, 404);
  }

  try {
    const response = await fetch(`${deactivateUrl}/${accountId}`, {
      method: "POST",
      headers: {
        "X-Arc-Auth": banAuthKey,
        "X-Arc-Client": arcClientId,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Arc deactivate failed for ${accountId}: ${response.status} - ${errorText}`);
      return c.json({ error: "Failed to deactivate on Arc", status: response.status, details: errorText }, 502);
    }

    await updateUser(accountId, { banned: true });
    logger.info(`"${user.username}" (${accountId}) has been deactivated on Arc`);

    return c.json({ success: true, message: `${accountId} has been deactivated on Arc and banned locally` });
  } catch (error) {
    logger.error(`Arc deactivate error for ${accountId}: ${error}`);
    return c.json({ error: "Failed to communicate with Arc API" }, 500);
  }
}
