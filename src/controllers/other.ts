import type { Context } from "hono";
import { logger } from "../utils/helpers";

export async function getRegion(c: Context) {
  return c.json({
    continent: {
      code: "NA",
      geoname_id: 1,
      names: { en: "North America" }
    },
    country: {
      geoname_id: 1,
      is_in_european_union: false,
      iso_code: "US",
      names: { en: "United States" }
    },
    subdivisions: [{
      geoname_id: 1,
      iso_code: "VA",
      names: { en: "Virginia" }
    }]
  });
}

export async function healthCheck(c: Context) {
  return c.text("OK");
}

export async function notFound(c: Context) {
  logger.debug(`404: ${c.req.method} ${c.req.url}`);
  return c.json({
    errorCode: "errors.com.exlo.common.not_found",
    errorMessage: "Resource not found",
    messageVars: [],
    numericErrorCode: 1004,
    originatingService: "exlo",
    intent: "prod"
  }, 404);
}

export async function getVersion(c: Context) {
  return c.json({
    app: "exlo",
    serverDate: new Date().toISOString(),
    overridePropertiesVersion: "unknown",
    cln: "17951730",
    build: "444",
    moduleName: "Fortnite-Core",
    buildDate: "2023-01-01T00:00:00.000Z",
    version: "OT6.5",
    branch: "Release-OT6.5",
    modules: {}
  });
}

export async function getAffiliate(c: Context) {
  const code = c.req.param("code");
  return c.json({
    id: code,
    slug: code,
    displayName: code,
    status: "ACTIVE",
    verified: true
  });
}

export async function getAffiliateSearch(c: Context) {
  return c.json([]);
}

export async function setAffiliate(c: Context) {
  return c.body(null, 204);
}

export async function getAccountSettings(c: Context) {
  return c.json({});
}

export async function getWex(c: Context) {
  return c.json({});
}

export async function getAthena(c: Context) {
  return c.json({});
}

export async function getSocialSettings(c: Context) {
  return c.json({
    appPrivacy: { partyType: { appId: "Fortnite", value: "Public" } },
    lastModified: new Date().toISOString(),
    version: 1
  });
}

export async function setSocialSettings(c: Context) {
  return c.body(null, 204);
}

export async function trackingStatus(c: Context) {
  return c.body(null, 204);
}

export async function getTryPlayOnPlatform(c: Context) {
  return c.text("true");
}

export async function getHotfixes(c: Context) {
  return c.json([]);
}

export async function emptyArray(c: Context) {
  return c.json([]);
}

export async function emptyObject(c: Context) {
  return c.json({});
}

export async function okResponse(c: Context) {
  return c.body(null, 204);
}
