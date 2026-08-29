import { Hono } from "hono";
import { cors } from "hono/cors";
import routes from "./routes";
import { initDatabase } from "./db";
import { logger } from "./utils/helpers";
import { startDiscordBot } from "./bot";
import { ipTrackingMiddleware } from "./middleware/ipTracking";
import { startShopRotator } from "./services/shopRotator";
import { xmppWebSocketHandler, createXmppClientData, xmppClients } from "./sockets";

const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Epic-Device-Id", "X-Epic-Correlation-Id"]
}));

app.use("*", ipTrackingMiddleware);

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  c.res.headers.set("X-Response-Time", `${ms}ms`);
});

app.route("/", routes);

const port = parseInt(process.env.PORT || "3000", 10);
const xmppPort = parseInt(process.env.XMPP_PORT || "5222", 10);

async function start() {
  try {
    await initDatabase();
    logger.info(`Database connected`);
  } catch (err) {
    logger.error(`Failed to connect to database: ${err}`);
    process.exit(1);
  }

  startShopRotator();

  Bun.serve({
    port,
    fetch(request, server) {
      const ip = server.requestIP(request);
      let clientIp = ip?.address || "unknown";

      if (clientIp.startsWith("::ffff:")) {
        clientIp = clientIp.slice(7);
      } else if (clientIp === "::1") {
        clientIp = "127.0.0.1";
      } else if (clientIp.includes(":") && !clientIp.includes(".")) {
        clientIp = clientIp;
      }

      request.headers.set("x-real-client-ip", clientIp);
      return app.fetch(request);
    },
    error(error) {
      logger.error(`Server error: ${error.message}`);
      return new Response("Internal Server Error", { status: 500 });
    }
  });

  Bun.serve({
    port: xmppPort,
    fetch(request, server) {
      const upgradeHeader = request.headers.get("upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        const upgraded = server.upgrade(request, {
          data: createXmppClientData(),
          headers: { "Sec-WebSocket-Protocol": "xmpp" }
        });
        if (upgraded) return undefined;
        return new Response("Upgrade failed", { status: 400 });
      }
      return new Response(
        JSON.stringify({
          clients: {
            amount: xmppClients.length,
            clients: xmppClients.map(c => c.displayName)
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    },
    websocket: xmppWebSocketHandler,
    error(error) {
      logger.error(`XMPP server error: ${error.message}`);
      return new Response("Internal Server Error", { status: 500 });
    }
  });

  logger.info(`Exlo backend running at http://localhost:${port}`);
  logger.info(`XMPP WebSocket listening on ws://localhost:${xmppPort}`);

  await startDiscordBot();
}

start();
