import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Audience } from "../../shared/contracts.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import type { AccountService } from "./account-service.js";
import type { SessionService } from "./sessions.js";
import type { DeviceService } from "../devices/device-service.js";
import type { IdentityService } from "../identity/identity-service.js";
import type { ConnectionHub } from "../delivery/connection-hub.js";
import { HttpError } from "../api/http-error.js";

const username = { type: "string", pattern: "^[a-zA-Z0-9_]{3,32}$" };
const password = { type: "string", minLength: 12, maxLength: 256 };
const audience = { type: "string", enum: ["user", "admin"] };
const authLimit = { rateLimit: { max: 5, timeWindow: 60000 } };
export function accountRoutes(app: FastifyInstance, pool: Pool, accounts: AccountService, sessions: SessionService, devices: DeviceService, identity: IdentityService, hub: ConnectionHub): void {
  app.post<{ Body: { operationId: string; username: string; password: string; invitation?: string } }>("/v1/accounts", {
    config: authLimit, schema: { body: { type: "object", additionalProperties: false, required: ["operationId","username","password"], properties: { operationId: uuidSchema, username, password, invitation: { type: "string", minLength: 32, maxLength: 128 } } } },
  }, async (request, reply) => {
    sessions.assertOrigin(request);
    const account = await accounts.register(request.body);
    return reply.code(201).send({ account });
  });
  app.post<{ Body: { username: string; password: string; audience: Audience } }>("/v1/sessions", {
    config: authLimit, schema: { body: { type: "object", additionalProperties: false, required: ["username","password","audience"], properties: { username,password,audience } } },
  }, async (request, reply) => {
    sessions.assertOrigin(request);
    const account = await accounts.authenticate(request.body.username,request.body.password,request.ip);
    const oldSession = await sessions.revoke(request,reply,request.body.audience);
    if (oldSession) hub.closeSession(oldSession);
    await sessions.create(reply,account,request.body.audience);
    return { account };
  });
  app.get<{ Querystring: { audience?: Audience } }>("/v1/session", { schema: { querystring: { type: "object", additionalProperties: false, properties: { audience } } } }, async request => {
    const current = await sessions.require(request,request.query.audience ?? "user");
    return { sessionId: current.id,account: current.account,audience: current.audience,deviceId: current.deviceId };
  });
  app.delete<{ Querystring: { audience: Audience } }>("/v1/sessions/current", { schema: { querystring: { type: "object", additionalProperties: false, required: ["audience"], properties: { audience } } } }, async (request,reply) => {
    sessions.assertCsrf(request,request.query.audience);
    await sessions.require(request,request.query.audience);
    const oldSession = await sessions.revoke(request,reply,request.query.audience);
    if (oldSession) hub.closeSession(oldSession);
    return reply.code(204).send();
  });
  app.post<{ Body: { password: string; audience: Audience } }>("/v1/sessions/reauthenticate", { config: authLimit, schema: { body: { type: "object", additionalProperties: false, required: ["password","audience"], properties: { password,audience } } } }, async request => {
    sessions.assertCsrf(request,request.body.audience);
    const current = await sessions.require(request,request.body.audience);
    await accounts.authenticate(current.account.username,request.body.password,request.ip);
    const updated = await pool.query("UPDATE echo.sessions SET reauthenticated_at=now() WHERE id=$1 AND expires_at>now() RETURNING id", [current.id]);
    if (!updated.rowCount) throw new HttpError(401,"SESSION_EXPIRED","会话已失效。");
    return { reauthenticated: true };
  });
  app.patch<{ Body: { username: string; version: string } }>("/v1/account/username", { schema: { body: { type: "object", additionalProperties: false, required: ["username","version"], properties: { username,version: sequenceSchema } } } }, async request => {
    sessions.assertCsrf(request,"user");
    const current = await sessions.require(request,"user",true);
    const account = await accounts.rename(current.account.id,request.body.username,request.body.version);
    hub.notify(current.account.id);
    return { account };
  });
  app.get("/v1/devices", async request => {
    const current = await sessions.require(request);
    return { items: await devices.list(current.account.id) };
  });
  app.post<{ Body: { label: string } }>("/v1/devices", { schema: { body: { type: "object", additionalProperties: false, required: ["label"], properties: { label: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" } } } } }, async request => {
    sessions.assertCsrf(request,"user");
    const current = await sessions.require(request,"user",true);
    const id = await devices.register(current.account.id,current.id,request.body.label);
    hub.notify(current.account.id);
    return { id, status: "pending", cryptoAuthorized: false };
  });
  app.post<{ Params: { id: string } }>("/v1/devices/:id/revoke", { schema: { params: { type: "object", additionalProperties: false, required: ["id"], properties: { id: uuidSchema } } } }, async request => {
    sessions.assertCsrf(request,"user");
    const current = await sessions.require(request,"user",true);
    const ids = await devices.revoke(current.account.id,request.params.id);
    for (const id of ids) hub.closeSession(id);
    hub.notify(current.account.id);
    return { serviceAccessRevoked: true, groupRemoval: "BLOCKED", reason: "An authorized MLS client must remove each leaf; affected groups are frozen." };
  });
  app.get("/v1/identity", async request => {
    const current = await sessions.require(request);
    return { identity: await identity.ownIdentity(current.account.id), initialization: "BLOCKED" };
  });
}
