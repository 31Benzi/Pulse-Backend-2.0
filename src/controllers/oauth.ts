import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import {
  findUserByEmail,
  findUserByUsername,
  findUserByAccountId,
  findDeviceAuth,
  createDeviceAuth,
  deleteDeviceAuth as dbDeleteDeviceAuth,
  findToken,
  deleteToken,
  createUser,
  createProfiles,
  createFriends
} from "../db/queries";
import { createAccessToken, createRefreshToken, decodeJwt } from "../utils/tokens";
import { sendError, generateUuid, logger } from "../utils/helpers";
import crypto from "crypto";

const bProd = false;

const authorizationCodes: { code: string; accountId: string }[] = [];
const exchangeCodes: { code: string; accountId: string }[] = [];

export async function oauthToken(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_client", "Missing Authorization header", [], 1011, "invalid_client", 400);
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "basic") {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_client", "Invalid Authorization header", [], 1011, "invalid_client", 400);
  }

  let clientId = "";
  try {
    const decoded = Buffer.from(parts[1], "base64").toString("utf-8");
    clientId = decoded.split(":")[0];
  } catch {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_client", "Invalid client credentials", [], 1011, "invalid_client", 400);
  }

  const contentType = c.req.header("Content-Type") || "";
  let payload: Record<string, string> = {};

  try {
    if (contentType.includes("application/json")) {
      payload = await c.req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await c.req.parseBody();
      for (const [k, v] of Object.entries(formData)) {
        if (typeof v === "string") {
          payload[k] = v;
        }
      }
    } else {
      const text = await c.req.text();
      const params = new URLSearchParams(text);
      for (const [k, v] of params.entries()) {
        payload[k] = v;
      }
    }
  } catch {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_request", "Failed to parse request body", [], 1013, "invalid_request", 400);
  }

  const grant = payload.grant_type;
  let user;

  switch (grant) {
    case "client_credentials": {
      const expire = new Date(Date.now() + 4 * 60 * 60 * 1000);
      return c.json({
        access_token: generateUuid(),
        expires_in: Math.floor((expire.getTime() - Date.now()) / 1000),
        expires_at: expire.toISOString(),
        token_type: "bearer",
        client_id: clientId,
        internal_client: true,
        client_service: "fortnite"
      });
    }

    case "authorization_code":
    case "exchange_code": {
      const code = grant === "authorization_code" ? payload.code : payload.exchange_code;
      const codeList = grant === "authorization_code" ? authorizationCodes : exchangeCodes;
      
      let accountId = "";
      let foundIndex = -1;
      for (let i = 0; i < codeList.length; i++) {
        if (codeList[i].code === code) {
          accountId = codeList[i].accountId;
          foundIndex = i;
          break;
        }
      }

      user = await findUserByAccountId(accountId);

      if (foundIndex !== -1) {
        codeList.splice(foundIndex, 1);
      }

      if (grant === "exchange_code" && !user) {
        return sendError(c, "errors.com.exlo.account.account_not_found", "Your account is not found possibly because of invalid credentials.", [], -1, null, 404);
      }
      break;
    }

    case "password": {
      user = await findUserByEmail(payload.username);
      if (!user) {
        return sendError(c, "errors.com.exlo.account.invalid_account_credentials", "Your e-mail and/or password are incorrect. Please check them and try again.", [], 18031, "invalid_grant", 400);
      }

      if (payload.password !== user.password) {
        return sendError(c, "errors.com.exlo.account.invalid_account_credentials", "Your e-mail and/or password are incorrect. Please check them and try again.", [], 18031, "invalid_grant", 400);
      }
      break;
    }

    case "device_auth": {
      const { account_id, device_id, secret } = payload;
      const auth = await findDeviceAuth(account_id, device_id, secret);
      if (!auth) {
        return sendError(c, "errors.com.exlo.common.authorization_failed", "Device auth not found", [account_id, device_id], 1032, null, 400);
      }
      user = await findUserByAccountId(auth.accountId);
      break;
    }

    default:
      return sendError(c, "errors.com.exlo.common.oauth.unsupported_grant_type", `Unsupported grant type: ${grant}`, [], 1016, "unsupported_grant_type", 400);
  }

  if (!user) {
    return sendError(c, "errors.com.exlo.account.account_not_found", "Your account is not found.", [], -1, null, 404);
  }

  if (user.banned) {
    return sendError(c, "errors.com.exlo.account.account_not_active", "You have been permanently banned from exlo.", [], -1, null, 400);
  }

  if (bProd && !user.isServer) {
    const arcAuth = c.req.header("HVIdvmfh3gzOWN89-YuiYyYa2A1fWVrDJFn7zGh5Hsw6xvXiJr6ngHfTW8X9kvM1X_qpOn4-nKF96HC0YEftcryB_AAfS1sckV1S3l87VbctOwxJGjr9Fg9WAaTy-3ti_6kxspEzzMh-EEOofa30XNyLHdzQSjqF13nbSFvJ0as2FZ0yQonvMxBTjfEnSVGVgBDcAkUXe98hKMutoSA0fMWzkZjOqU4Z9ctU7-uKFqHBr");
    const arcClient = c.req.header("nemqoixqnjtvdzpsdcgbeubsroxccwjh");

    if (!arcAuth || !arcClient) {
      return c.json([], 404);
    }

    const resp = await fetch(
      "https://dev-anticheat-v1.arc-services.dev/router/v1/anticheat/public/status",
      {
        method: "GET",
        headers: {
          "X-Arc-Client": arcClient,
          "X-Arc-Auth": arcAuth,
        },
      }
    );
    if (!resp.ok) {
      return c.text("", resp.status as ContentfulStatusCode);
    }
  }

  const deviceId = payload.device_id || generateUuid();
  const access = await createAccessToken(user, clientId, grant, deviceId, 8);
  const refresh = await createRefreshToken(user, clientId, grant, deviceId, 24);

  return c.json({
    access_token: access,
    expires_in: 8 * 3600,
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    token_type: "bearer",
    refresh_token: refresh,
    refresh_expires: 24 * 3600,
    refresh_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    account_id: user.accountId,
    client_id: clientId,
    internal_client: true,
    client_service: "prod-fn",
    displayName: user.username,
    username: user.username,
    perms: [],
    app: "fortnite",
    in_app_id: user.accountId,
    device_id: deviceId
  });
}

export async function verifyToken(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return c.text("Missing auth header", 400);
  }

  const rawToken = authHeader.slice(7).trim();
  const tokenStore = await findToken(rawToken);
  
  if (!tokenStore) {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_token", "Invalid token.", [], 1013, "invalid_token", 401);
  }

  const claims = decodeJwt(rawToken);
  if (!claims) {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_token", "Invalid token.", [], 1013, "invalid_token", 401);
  }

  const creationDate = new Date(claims.creation_date);
  const hoursExpire = claims.hours_expire || 0;
  const expiry = new Date(creationDate.getTime() + hoursExpire * 60 * 60 * 1000);

  if (expiry.getTime() <= Date.now()) {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_token", "Token expired.", [], 1013, "token_expired", 401);
  }

  const user = await findUserByAccountId(tokenStore.accountId);
  if (!user) {
    return sendError(c, "errors.com.exlo.account.not_found", "User not found.", [], 18007, null, 404);
  }

  return c.json({
    token: rawToken,
    session_id: claims.jti,
    token_type: "bearer",
    client_id: claims.clid,
    internal_client: true,
    client_service: "fortnite",
    account_id: user.accountId,
    expires_in: Math.floor((expiry.getTime() - Date.now()) / 1000),
    expires_at: expiry.toISOString(),
    auth_method: claims.am,
    display_name: user.username,
    app: "fortnite",
    in_app_id: user.accountId,
    device_id: claims.dvid
  });
}

export async function deleteTokenHandler(c: Context) {
  const token = c.req.param("token");
  if (token) {
    await deleteToken(token);
  }
  return c.body(null, 204);
}

export async function createDeviceAuthHandler(c: Context) {
  const accountId = c.req.param("accountId");
  
  let ip = c.req.header("X-Forwarded-For") || "127.0.0.1";
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const hashedIP = crypto.createHash("sha256").update(ip).digest("hex");
  const deviceId = generateUuid();
  const secret = generateUuid();
  const userAgent = c.req.header("User-Agent") || "";

  const deviceAuth = await createDeviceAuth(deviceId, accountId, secret, userAgent, "idk", hashedIP);

  return c.json(deviceAuth);
}

export async function deleteDeviceAuthHandler(c: Context) {
  const accountId = c.req.param("accountId");
  const deviceId = c.req.param("deviceId");
  await dbDeleteDeviceAuth(accountId, deviceId);
  return c.body(null, 204);
}

export async function login(c: Context) {
  const email = c.req.query("email");
  const password = c.req.query("password");

  if (!email || !password) {
    return sendError(c, "errors.com.exlo.common.invalid_request", "Missing credentials.", [], 400, null, 400);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return sendError(c, "errors.com.exlo.common.account_not_found", "Account not found.", [], 404, null, 404);
  }

  if (password !== user.password) {
    return sendError(c, "errors.com.exlo.account.invalid_password", "Invalid password.", [], 403, null, 403);
  }

  const claims = {
    sub: user.accountId,
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
    iat: Math.floor(Date.now() / 1000),
    email: user.email
  };

  const token = jwt.sign(claims, process.env.JWT_SECRET || "secret");

  return c.json({
    token,
    token_type: "bearer",
    expires_in: 3600,
    accountId: user.accountId,
    username: user.username
  });
}

export async function register(c: Context) {
  const contentType = c.req.header("Content-Type") || "";
  let payload: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    payload = await c.req.json();
  } else {
    const formData = await c.req.parseBody();
    for (const [k, v] of Object.entries(formData)) {
      if (typeof v === "string") {
        payload[k] = v;
      }
    }
  }

  const { username, email, password } = payload;

  if (!username || !email || !password) {
    return sendError(c, "errors.com.exlo.common.invalid_request", "Missing credentials.", [], 400, null, 400);
  }

  if (await findUserByEmail(email)) {
    return sendError(c, "errors.com.exlo.common.used_email", "Email already in use.", [], 409, null, 409);
  }

  if (await findUserByUsername(username)) {
    return sendError(c, "errors.com.exlo.common.used_username", "Username already in use.", [], 409, null, 409);
  }

  const emailRegex = /^([a-zA-Z0-9_.\-])+@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  if (!emailRegex.test(email)) {
    return sendError(c, "errors.com.exlo.common.invalid_email", "Invalid email format.", [], 400, null, 400);
  }

  if (username.length < 3 || username.length >= 25) {
    return sendError(c, "errors.com.exlo.common.invalid_username", "Username must be 3-24 characters long.", [], 400, null, 400);
  }

  if (password.length < 4 || password.length >= 128) {
    return sendError(c, "errors.com.exlo.common.invalid_password", "Password must be 4-127 characters long.", [], 400, null, 400);
  }

  const accountId = generateUuid();
  const matchmakingId = generateUuid();
  await createUser({
    accountId,
    username,
    email,
    password,
    matchmakingId,
    isServer: false,
    banned: false,
    arenaDivision: 1,
    arenaHype: 0
  });

  await createProfiles(accountId);
  await createFriends(accountId);

  return c.text("Account successfully created!", 201);
}

export async function redirect(c: Context) {
  const clientID = c.req.query("clientId");
  const shouldRedirect = c.req.query("shouldRedirect");

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return c.text("Missing authorization header", 401);
  }

  const rawToken = authHeader.slice(7).trim();
  
  try {
    const token = jwt.verify(rawToken, process.env.JWT_SECRET || "secret") as jwt.JwtPayload;
    const accountId = token.sub;

    if (!accountId) {
      return c.text("Invalid token claims", 401);
    }

    let authCodeObj = authorizationCodes.find(ac => ac.accountId === accountId);

    if (!authCodeObj) {
      const newCode = generateUuid();
      authCodeObj = { code: newCode, accountId };
      authorizationCodes.push(authCodeObj);

      setTimeout(() => {
        const index = authorizationCodes.findIndex(ac => ac.code === newCode);
        if (index !== -1) {
          authorizationCodes.splice(index, 1);
        }
      }, 5 * 60 * 1000);
    }

    let redirectURL = "";
    if (clientID === "3f69e56c7649492c8cc29f1af08a8a12") {
      redirectURL = `com.epicgames.fortnite://authorize/?code=${authCodeObj.code}`;
    } else {
      redirectURL = `http://localhost/?code=${authCodeObj.code}`;
    }

    if (shouldRedirect === "true") {
      return c.redirect(redirectURL, 302);
    }

    return c.json({
      redirectUrl: redirectURL,
      authorizationCode: authCodeObj.code,
      exchangeCode: null,
      sid: null
    });
  } catch {
    return c.text("Invalid or expired token", 401);
  }
}

export async function createExchangeCode(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return c.text("Missing authorization header", 401);
  }

  const rawToken = authHeader.slice(7).trim();
  const tokenStore = await findToken(rawToken);
  
  if (!tokenStore) {
    return sendError(c, "errors.com.exlo.common.oauth.invalid_token", "Invalid token.", [], 1013, "invalid_token", 401);
  }

  const accountId = tokenStore.accountId;

  for (let i = exchangeCodes.length - 1; i >= 0; i--) {
    if (exchangeCodes[i].accountId === accountId) {
      exchangeCodes.splice(i, 1);
    }
  }

  const newCode = generateUuid();
  exchangeCodes.push({ code: newCode, accountId });

  setTimeout(() => {
    const index = exchangeCodes.findIndex(ec => ec.code === newCode);
    if (index !== -1) {
      exchangeCodes.splice(index, 1);
    }
  }, 5 * 60 * 1000);

  const user = await findUserByAccountId(accountId);
  if (!user) {
    return sendError(c, "errors.com.exlo.account.not_found", "User not found.", [], 18007, null, 404);
  }

  return c.json({
    expiresInSeconds: 300,
    code: newCode,
    accountId: user.accountId
  });
}
