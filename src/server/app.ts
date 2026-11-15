import { randomBytes, randomUUID } from "node:crypto";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { capabilities } from "../shared/capabilities.js";
import type { ServerConfig } from "./config.js";
import { createDatabase } from "./storage/database.js";
import { HttpError } from "./api/http-error.js";
import { passwordHash } from "./accounts/passwords.js";
import { AccountService } from "./accounts/account-service.js";
import { SessionService } from "./accounts/sessions.js";
import { DeviceService } from "./devices/device-service.js";
import { IdentityService } from "./identity/identity-service.js";
import { DeliveryService } from "./delivery/delivery-service.js";
import { DeletionService } from "./lifecycle/deletion-service.js";
import { ConnectionHub } from "./delivery/connection-hub.js";
import { dataRoutes } from "./accounts/data-routes.js";
import { sessionManagementRoutes } from "./accounts/session-management.js";
import { accountRoutes } from "./accounts/account-routes.js";
import { deliveryRoutes } from "./delivery/delivery-routes.js";
import { adminReadRoutes } from "./admin/admin-read-routes.js";
import { storageRoutes } from "./admin/storage-routes.js";
import { adminActionRoutes } from "./admin/admin-action-routes.js";
import { adminRoutes } from "./admin/admin-routes.js";
import { lifecycleRoutes } from "./lifecycle/lifecycle-routes.js";
export async function createApp(config: ServerConfig) {
  const app = Fastify({
    bodyLimit: 360448,
    requestTimeout: 15000,
    connectionTimeout: 10000,
    trustProxy: ["127.0.0.1", "::1"],
    disableRequestLogging: true,
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: false,
      },
    },
    logger: {
      level: config.logLevel,
      redact: [
        "req.body",
        "req.headers.cookie",
        "req.headers.authorization",
        "res.headers.set-cookie",
      ],
    },
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: 60000,
    cache: 5000,
  });
  await app.register(websocket, {
    options: {
      maxPayload: 1024,
      perMessageDeflate: false,
    },
  });
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, request, reply) => {
    const frameworkStatus =
      error instanceof Error && "statusCode" in error ? error.statusCode : null;
    const databaseCode =
      error instanceof Error && "code" in error ? error.code : null;
    const transactionConflict =
      typeof databaseCode === "string" &&
      ["40P01", "40001", "55P03"].includes(databaseCode);
    const status =
      error instanceof HttpError
        ? error.status
        : databaseCode === "23505"
          ? 409
          : transactionConflict
            ? 503
            : typeof frameworkStatus === "number" &&
                Number.isInteger(frameworkStatus) &&
                frameworkStatus >= 400 &&
                frameworkStatus < 500
              ? frameworkStatus
              : 500;
    const code =
      error instanceof HttpError
        ? error.code
        : transactionConflict
          ? "TRANSACTION_RETRY_REQUIRED"
          : status === 400
            ? "INVALID_REQUEST"
            : status === 409
              ? "CONFLICT"
              : status === 429
                ? "RATE_LIMITED"
                : "SERVICE_ERROR";
    if (status >= 500)
      app.log.error(
        {
          requestId: request.id,
          code,
        },
        "Request failed; sensitive diagnostics suppressed",
      );
    return reply.code(status).send({
      error: {
        code,
        message:
          error instanceof HttpError
            ? error.message
            : "请求未完成，请检查状态后重试。",
        requestId: request.id,
      },
    });
  });
  const pool = createDatabase(config.databaseUrl);
  pool.on("error", () => app.log.error("Database unavailable"));
  const hub = new ConnectionHub();
  const sessions = new SessionService(pool, config.origin);
  const deletions = new DeletionService(pool);
  const devices = new DeviceService(pool);
  const accounts = new AccountService(
    pool,
    await passwordHash(randomBytes(32).toString("base64url")),
  );
  accountRoutes(
    app,
    pool,
    accounts,
    sessions,
    devices,
    new IdentityService(pool),
    hub,
  );
  dataRoutes(app, pool, sessions, config.origin);
  sessionManagementRoutes(app, pool, sessions, hub);
  deliveryRoutes(app, pool, sessions, new DeliveryService(pool), hub);
  adminRoutes(app, pool, sessions, hub);
  adminReadRoutes(app, pool, sessions);
  storageRoutes(app, sessions, config.mediaPath);
  adminActionRoutes(app, pool, sessions, devices, hub);
  lifecycleRoutes(app, sessions, deletions);
  app.get("/v1/health", async () => ({
    status: "alive",
    productionReady: false,
  }));
  app.get("/v1/capabilities", async () => capabilities);
  app.get("/v1/registration", async () => {
    const result = await pool.query(
      "SELECT registration_mode FROM echo.site_settings WHERE singleton",
    );
    return {
      mode: result.rows[0]?.registration_mode ?? "unknown",
    };
  });
  let working = false;
  const timer = setInterval(() => {
    hub.expire();
    if (working) return;
    working = true;
    void Promise.allSettled([
      deletions.scheduleExpired(),
      sessions.pruneExpired(),
    ])
      .then((results) => {
        for (const [index, result] of results.entries())
          if (result.status === "rejected")
            app.log.error(
              index === 0
                ? "Expiry scheduling failed; no purge performed"
                : "Expired session cleanup failed",
            );
      })
      .finally(() => {
        working = false;
      });
  }, 30000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    hub.close();
    await pool.end();
  });
  return app;
}
