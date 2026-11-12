import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Audience } from "../../shared/contracts.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import type { AccountService } from "./account-service.js";
import type { SessionService } from "./sessions.js";
import type { DeviceService } from "../devices/device-service.js";
import type { IdentityService } from "../identity/identity-service.js";
import type { ConnectionHub } from "../delivery/connection-hub.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "./session-access.js";
import { HttpError } from "../api/http-error.js";
const username = {
  type: "string",
  pattern: "^[a-zA-Z0-9_]{3,32}$",
};
const password = {
  type: "string",
  minLength: 12,
  maxLength: 256,
};
const audience = {
  type: "string",
  enum: ["user", "admin"],
};
const authLimit = {
  rateLimit: {
    max: 5,
    timeWindow: 60000,
  },
};
export function accountRoutes(
  app: FastifyInstance,
  pool: Pool,
  accounts: AccountService,
  sessions: SessionService,
  devices: DeviceService,
  identity: IdentityService,
  hub: ConnectionHub,
): void {
  app.post<{
    Body: {
      operationId: string;
      username: string;
      password: string;
      invitation?: string;
    };
  }>(
    "/v1/accounts",
    {
      config: authLimit,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["operationId", "username", "password"],
          properties: {
            operationId: uuidSchema,
            username,
            password,
            invitation: {
              type: "string",
              minLength: 32,
              maxLength: 128,
            },
          },
        },
      },
    },
    async (request, reply) => {
      sessions.assertOrigin(request);
      const account = await accounts.register(request.body);
      return reply.code(201).send({
        account,
      });
    },
  );
  app.post<{
    Body: {
      username: string;
      password: string;
      audience: Audience;
    };
  }>(
    "/v1/sessions",
    {
      config: authLimit,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password", "audience"],
          properties: {
            username,
            password,
            audience,
          },
        },
      },
    },
    async (request, reply) => {
      sessions.assertOrigin(request);
      const account = await accounts.authenticate(
        { username: request.body.username },
        request.body.password,
        request.ip,
      );
      const oldSession = await sessions.revoke(
        request,
        reply,
        request.body.audience,
      );
      if (oldSession) hub.closeSession(oldSession);
      await sessions.create(reply, account, request.body.audience);
      return {
        account,
      };
    },
  );
  app.get<{
    Querystring: {
      audience?: Audience;
    };
  }>(
    "/v1/session",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            audience,
          },
        },
      },
    },
    async (request) => {
      const current = await sessions.require(
        request,
        request.query.audience ?? "user",
      );
      return {
        sessionId: current.id,
        account: current.account,
        audience: current.audience,
        deviceId: current.deviceId,
      };
    },
  );
  app.delete<{
    Querystring: {
      audience: Audience;
    };
  }>(
    "/v1/sessions/current",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["audience"],
          properties: {
            audience,
          },
        },
      },
    },
    async (request, reply) => {
      sessions.assertCsrf(request, request.query.audience);
      await sessions.require(request, request.query.audience);
      const oldSession = await sessions.revoke(
        request,
        reply,
        request.query.audience,
      );
      if (oldSession) hub.closeSession(oldSession);
      return reply.code(204).send();
    },
  );
  app.post<{
    Body: {
      password: string;
      audience: Audience;
    };
  }>(
    "/v1/sessions/reauthenticate",
    {
      config: authLimit,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["password", "audience"],
          properties: {
            password,
            audience,
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, request.body.audience);
      const current = await sessions.require(request, request.body.audience);
      await accounts.authenticate(
        { userId: current.account.id },
        request.body.password,
        request.ip,
      );
      await transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: current.audience,
        });
        await db.query(
          "UPDATE echo.sessions SET reauthenticated_at=clock_timestamp() WHERE id=$1",
          [current.id],
        );
      });
      return {
        reauthenticated: true,
      };
    },
  );
  app.patch<{
    Body: {
      username: string;
      version: string;
    };
  }>(
    "/v1/account/username",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "version"],
          properties: {
            username,
            version: sequenceSchema,
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      const account = await accounts.rename(
        current.account.id,
        current.id,
        request.body.username,
        request.body.version,
      );
      hub.notify(current.account.id);
      return {
        account,
      };
    },
  );
  app.get<{
    Querystring: {
      username?: string;
      publicId?: string;
    };
  }>(
    "/v1/accounts/lookup",
    {
      config: authLimit,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          oneOf: [{ required: ["username"] }, { required: ["publicId"] }],
          properties: {
            publicId: { type: "string", pattern: "^[A-Za-z2-7]{12}$" },
            username,
          },
        },
      },
    },
    async (request) => {
      await sessions.require(request);
      const result = await pool.query(
        'SELECT id,public_id AS "publicId",username FROM echo.users WHERE (($1::text IS NOT NULL AND username_normalized=lower($1 COLLATE "C")) OR ($2::text IS NOT NULL AND public_id=upper($2 COLLATE "C"))) AND status=\'active\'',
        [request.query.username ?? null, request.query.publicId ?? null],
      );
      if (!result.rows[0])
        throw new HttpError(404, "ACCOUNT_NOT_FOUND", "未找到可用账号。");
      return {
        ...result.rows[0],
        trust: "unverified-directory",
      };
    },
  );
  app.get<{ Querystring: { after?: string } }>(
    "/v1/devices",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { after: uuidSchema },
        },
      },
    },
    async (request) => {
      const current = await sessions.require(request);
      return devices.list(current.account.id, request.query.after ?? null);
    },
  );
  app.post<{
    Body: {
      label: string;
    };
  }>(
    "/v1/devices",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["label"],
          properties: {
            label: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              pattern: "\\S",
            },
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      const id = await devices.register(
        current.account.id,
        current.id,
        request.body.label,
      );
      hub.notify(current.account.id);
      return {
        id,
        status: "pending",
        cryptoAuthorized: false,
      };
    },
  );
  app.post<{
    Params: {
      id: string;
    };
  }>(
    "/v1/devices/:id/revoke",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: uuidSchema,
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      const ids = await devices.revoke(current, request.params.id);
      for (const id of ids) hub.closeSession(id);
      hub.notify(current.account.id);
      return {
        serviceAccessRevoked: true,
        groupRemoval: "BLOCKED",
        reason:
          "An authorized MLS client must remove each leaf; affected groups are frozen.",
      };
    },
  );
  app.get("/v1/identity", async (request) => {
    const current = await sessions.require(request);
    return {
      identity: await identity.ownIdentity(current.account.id),
      initialization: "BLOCKED",
    };
  });
}
