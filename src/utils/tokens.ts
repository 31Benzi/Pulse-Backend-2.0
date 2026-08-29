import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { upsertToken, findToken, deleteToken as dbDeleteToken } from "../db/queries";
import type { User } from "../db/schema";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret";

export async function createAccessToken(
  user: User,
  clientId: string,
  grantType: string,
  deviceId: string,
  expiresIn: number
): Promise<string> {
  const p = Buffer.from(uuidv4().replace(/-/g, "")).toString("base64");
  const jti = uuidv4().replace(/-/g, "");

  const claims = {
    app: "fortnite",
    sub: user.accountId,
    dvid: deviceId,
    mver: false,
    clid: clientId,
    dn: user.username,
    am: grantType,
    p,
    iai: user.accountId,
    sec: 1,
    clsvc: "fortnite",
    t: "s",
    ic: true,
    jti,
    creation_date: new Date().toISOString(),
    hours_expire: expiresIn
  };

  const token = jwt.sign(claims, JWT_SECRET);

  await upsertToken(user.accountId, {
    accessToken: token,
    updatedAt: new Date(),
    createdAt: new Date()
  });

  return token;
}

export async function createRefreshToken(
  user: User,
  clientId: string,
  grantType: string,
  deviceId: string,
  expiresIn: number
): Promise<string> {
  const jti = uuidv4().replace(/-/g, "");

  const claims = {
    sub: user.accountId,
    dvid: deviceId,
    t: "r",
    clid: clientId,
    am: grantType,
    jti,
    creation_date: new Date().toISOString(),
    hours_expire: expiresIn
  };

  const token = jwt.sign(claims, JWT_SECRET);

  await upsertToken(user.accountId, {
    refreshToken: token,
    updatedAt: new Date()
  });

  return token;
}

export function verifyJwt(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "object") {
      return decoded as jwt.JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (typeof decoded === "object") {
      return decoded as jwt.JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export async function validateToken(token: string): Promise<{ valid: boolean; accountId?: string; claims?: jwt.JwtPayload }> {
  const claims = decodeJwt(token);
  if (!claims) {
    return { valid: false };
  }

  const tokenRecord = await findToken(token);
  if (!tokenRecord) {
    return { valid: false };
  }

  if (claims.hours_expire && claims.creation_date) {
    const creationTime = new Date(claims.creation_date);
    const expiryTime = new Date(creationTime.getTime() + claims.hours_expire * 60 * 60 * 1000);

    if (expiryTime < new Date()) {
      await dbDeleteToken(token);
      return { valid: false };
    }
  }

  return { valid: true, accountId: tokenRecord.accountId, claims };
}
