import type { Context } from "hono";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "../utils/helpers";

export async function listSystemFiles(c: Context) {
  const dir = path.join(process.cwd(), "static", "patches");
  const files: Record<string, unknown>[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (!entry.name.endsWith(".ini")) continue;

      const fullPath = path.join(dir, entry.name);
      const data = fs.readFileSync(fullPath);
      const stats = fs.statSync(fullPath);

      const sha1Hash = crypto.createHash("sha1").update(data).digest("hex");
      const sha256Hash = crypto.createHash("sha256").update(data).digest("hex");

      files.push({
        uniqueFilename: entry.name,
        filename: entry.name,
        hash: sha1Hash,
        hash256: sha256Hash,
        length: data.length,
        contentType: "application/octet-stream",
        uploaded: stats.mtime.toISOString(),
        storageType: "S3",
        storageIds: {},
        doNotCache: true
      });
    }
  } catch (err) {
    logger.warn(`Directory ${dir} not found`);
    return c.body(null, 500);
  }

  return c.json(files);
}

export async function serveSystemFile(c: Context) {
  const file = path.basename(c.req.param("file"));
  const patchesDir = path.join(process.cwd(), "static", "patches");
  const filePath = path.join(patchesDir, file);

  if (!filePath.startsWith(patchesDir + path.sep) && filePath !== patchesDir) {
    return c.text("File not found", 404);
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return c.text(data);
  } catch {
    return c.text("File not found", 404);
  }
}

export async function listUserFiles(c: Context) {
  const accountId = c.req.param("accountId");
  const settingsPath = path.join(process.cwd(), "static", "usersettings", accountId);

  if (!fs.existsSync(settingsPath)) {
    fs.mkdirSync(settingsPath, { recursive: true });
  }

  const files: Record<string, unknown>[] = [];

  try {
    const saves = fs.readdirSync(settingsPath);

    for (const file of saves) {
      if (!file.toLowerCase().includes("clientsettings")) continue;

      const fullPath = path.join(settingsPath, file);
      const data = fs.readFileSync(fullPath);
      const stats = fs.statSync(fullPath);

      const sha1Hash = crypto.createHash("sha1").update(data).digest("hex");
      const sha256Hash = crypto.createHash("sha256").update(data).digest("hex");

      files.push({
        uniqueFilename: file,
        filename: file,
        hash: sha1Hash,
        hash256: sha256Hash,
        length: data.length,
        contentType: "application/octet-stream",
        uploaded: stats.mtime.toISOString(),
        storageType: "S3",
        storageIds: {},
        metadata: {
          isHotfix: { empty: true, present: false }
        },
        accountId,
        doNotCache: false
      });
    }
  } catch (err) {
    logger.warn(`Failed to read user settings for ${accountId}`);
    return c.body(null, 500);
  }

  return c.json(files);
}

export async function serveUserFile(c: Context) {
  const accountId = c.req.param("accountId");
  const fileParam = c.req.param("file");

  const clientPath = path.join(process.cwd(), "static", "usersettings", accountId);

  if (!fs.existsSync(clientPath)) {
    fs.mkdirSync(clientPath, { recursive: true });
  }

  if (!fileParam.toLowerCase().includes("clientsettings")) {
    return c.json([]);
  }

  const filePath = path.join(clientPath, fileParam);

  if (fs.existsSync(filePath)) {
    const data = fs.readFileSync(filePath);
    return c.body(data);
  }

  return c.json([]);
}

export async function uploadUserFile(c: Context) {
  const accountId = c.req.param("accountId");
  const fileParam = c.req.param("file");

  const clientPath = path.join(process.cwd(), "static", "usersettings", accountId);

  if (!fs.existsSync(clientPath)) {
    fs.mkdirSync(clientPath, { recursive: true });
  }

  if (!fileParam.toLowerCase().includes("clientsettings")) {
    return c.text("File is not a valid ClientSettings file", 400);
  }

  const filePath = path.join(clientPath, fileParam);
  const body = await c.req.arrayBuffer();

  fs.writeFileSync(filePath, Buffer.from(body));

  return c.body(null, 204);
}
