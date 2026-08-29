import type { Context } from "hono";
import fs from "fs";
import path from "path";

export async function getEula(c: Context) {
  const eulaFile = fs.readFileSync(path.join(process.cwd(), "static", "responses", "EULA.json"), "utf-8");
  return c.json(JSON.parse(eulaFile));
}

export async function acceptEula(c: Context) {
  return c.body(null, 204);
}

export async function checkEulaAccepted(c: Context) {
  return c.body(null, 204);
}
