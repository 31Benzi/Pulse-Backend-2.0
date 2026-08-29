import type { Context } from "hono";
import type { VersionInfo, ErrorResponse } from "../types";

export function getVersionInfo(userAgent: string): VersionInfo {
  const memory: VersionInfo = {
    season: 0,
    build: 0,
    cl: "0",
    lobby: ""
  };

  if (!userAgent) return memory;

  let cl = "";
  const parts = userAgent.split("-");

  if (parts.length > 3) {
    let buildId = parts[3].split(",")[0];
    if (/^\d+$/.test(buildId)) {
      cl = buildId;
    } else {
      buildId = parts[3].split(" ")[0];
      if (/^\d+$/.test(buildId)) {
        cl = buildId;
      }
    }
  }

  if (!cl && parts.length > 1) {
    const buildId = parts[1].split("+")[0];
    if (/^\d+$/.test(buildId)) {
      cl = buildId;
    }
  }

  let build = "";
  if (userAgent.includes("Release-")) {
    const sub = userAgent.split("Release-");
    if (sub.length > 1) {
      build = sub[1].split("-")[0];
    }
  }

  if (build) {
    const vals = build.split(".");
    if (vals.length === 3) {
      build = vals[0] + "." + vals[1] + vals[2];
    }
    const f = parseFloat(build);
    if (!isNaN(f)) {
      memory.build = f;
      memory.season = parseInt(vals[0]) || 0;
    }
  }

  memory.cl = cl;
  memory.lobby = `LobbySeason${memory.season}`;

  return memory;
}

export function sendError(
  c: Context,
  errorCode: string,
  errorMessage: string,
  messageVars: unknown[],
  numericErrorCode: number,
  errDetail: string | null,
  statusCode: number
) {
  c.header("X-Epic-Error-Name", errorCode);
  c.header("X-Epic-Error-Code", String(numericErrorCode));

  const resp: ErrorResponse = {
    errorCode,
    errorMessage,
    messageVars,
    numericErrorCode,
    originatingService: "any",
    intent: "prod",
    error_description: errorMessage
  };

  if (errDetail) {
    resp.error = errDetail;
  }

  return c.json(resp, statusCode as 400);
}

export async function sendXmppMessage(targetId: string, body: Record<string, unknown>): Promise<void> {
  const { sendXmppToAccountId } = await import("../sockets/xmpp");
  sendXmppToAccountId(targetId, body);
}

export function toInt(v: unknown): number {
  if (typeof v === "number") return Math.floor(v);
  if (typeof v === "string") return parseInt(v) || 0;
  return 0;
}

export function generateUuid(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function getTimestamp(): string {
  const now = new Date();
  return now.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

const clr = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  gray:    "\x1b[90m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
};

const methodColors: Record<string, string> = {
  GET: clr.cyan, POST: clr.yellow, DELETE: clr.red,
  PUT: clr.blue, PATCH: clr.magenta, OPTIONS: clr.gray, HEAD: clr.gray,
};

function colorizeMsg(msg: string): string {
  return msg
    .replace(/\[(\w+)\]/g, (match, tag) =>
      methodColors[tag]
        ? `${methodColors[tag]}${match}${clr.reset}`
        : `${clr.bold}${clr.white}${match}${clr.reset}`
    )
    .replace(/ - (\d{1,3}(?:\.\d{1,3}){3})/, ` - ${clr.gray}$1${clr.reset}`);
}

function fmt(...args: unknown[]): string {
  return args.map(a => colorizeMsg(typeof a === "string" ? a : String(a))).join(" ");
}

export const logger = {
  info:     (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.green}[INFO]${clr.reset} ${fmt(...args)}`),
  backend:  (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.blue}[BACKEND]${clr.reset} ${fmt(...args)}`),
  database: (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.magenta}[DATABASE]${clr.reset} ${fmt(...args)}`),
  warn:     (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.yellow}[WARNING]${clr.reset} ${fmt(...args)}`),
  error:    (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.red}[ERROR]${clr.reset} ${fmt(...args)}`),
  debug:    (...args: unknown[]) => console.log(`${clr.gray}[${getTimestamp()}]${clr.reset} ${clr.cyan}[DEBUG]${clr.reset} ${fmt(...args)}`),
};
