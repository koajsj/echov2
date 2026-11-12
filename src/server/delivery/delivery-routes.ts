import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { DeliveryEnvelope } from "../../shared/contracts.js";
import { limits } from "../../shared/contracts.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import type { SessionService } from "../accounts/sessions.js";
import type { DeliveryService } from "./delivery-service.js";
import type { ConnectionHub } from "./connection-hub.js";
import { HttpError } from "../api/http-error.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "../accounts/session-access.js";
export function deliveryRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
  delivery: DeliveryService,
  hub: ConnectionHub,
): void {
  app.get<{
    Querystring: {
      context: string;
    };
  }>(
    "/v1/events",
    {
      websocket: true,
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          required: ["context"],
          properties: {
            context: uuidSchema,
          },
        },
      },
      preValidation: async (request) => {
        sessions.assertOrigin(request);
        const current = await sessions.require(request);
        if (request.query.context !== current.id)
          throw new HttpError(409, "SESSION_CHANGED", "通知会话已变化。");
      },
    },
    (socket, request) => {
      // Install listeners synchronously; no inbound messages are accepted.
      socket.on("error", () => socket.close());
      void sessions
        .require(request)
        .then(async (current) => {
          if (current.id !== request.query.context) {
            socket.close(1008, "Session changed");
            return;
          }
          // Attach while holding the same account/session locks as revocation.
          // A later revoker can then observe and close this socket after commit.
          await transaction(pool, async (db) => {
            await lockUserSession(db, current.account.id, current.id);
            if (socket.readyState === 1)
              hub.attach(socket, current.id, current.account.id);
          });
        })
        .catch(() => socket.terminate());
    },
  );
  app.get<{
    Querystring: {
      after?: string;
    };
  }>(
    "/v1/conversations",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            after: uuidSchema,
          },
        },
      },
    },
    async (request) => {
      const current = await sessions.require(request);
      const deviceId = await sessions.requireActiveDevice(current);
      return delivery.conversations(
        current.account.id,
        current.id,
        deviceId,
        request.query.after ?? null,
      );
    },
  );
  app.get<{
    Params: {
      id: string;
    };
  }>(
    "/v1/operations/:id",
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
      const current = await sessions.require(request);
      const deviceId = await sessions.requireActiveDevice(current);
      return delivery.operation(
        current.account.id,
        current.id,
        deviceId,
        request.params.id,
      );
    },
  );
  app.post<{
    Body: DeliveryEnvelope;
  }>(
    "/v1/messages",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "operationId",
            "messageId",
            "conversationId",
            "baseRouteVersion",
            "wireKind",
            "ciphertext",
            "expiresAt",
          ],
          properties: {
            operationId: uuidSchema,
            messageId: uuidSchema,
            conversationId: uuidSchema,
            baseRouteVersion: sequenceSchema,
            wireKind: {
              type: "string",
              enum: ["application", "proposal", "commit"],
            },
            ciphertext: {
              type: "string",
              minLength: 4,
              maxLength: 349528,
            },
            expiresAt: {
              anyOf: [
                {
                  type: "string",
                  format: "date-time",
                },
                {
                  type: "null",
                },
              ],
            },
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request);
      const deviceId = await sessions.requireActiveDevice(current);
      return delivery.append(
        current.account.id,
        current.id,
        deviceId,
        request.body,
      );
    },
  );
  app.get<{
    Params: {
      id: string;
    };
    Querystring: {
      after?: string;
      limit?: number;
    };
  }>(
    "/v1/conversations/:id/messages",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          additionalProperties: false,
          properties: {
            id: uuidSchema,
          },
        },
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            after: sequenceSchema,
            limit: {
              type: "integer",
              minimum: 1,
              maximum: limits.maxPageSize,
            },
          },
        },
      },
    },
    async (request) => {
      const current = await sessions.require(request);
      const deviceId = await sessions.requireActiveDevice(current);
      return delivery.page(
        current.account.id,
        current.id,
        deviceId,
        request.params.id,
        request.query.after ?? "0",
        request.query.limit ?? limits.pageSize,
      );
    },
  );
  app.post<{
    Body: {
      conversationId: string;
      seq: string;
    };
  }>(
    "/v1/cursors",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["conversationId", "seq"],
          properties: {
            conversationId: uuidSchema,
            seq: sequenceSchema,
          },
        },
      },
    },
    async (request, reply) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request);
      const deviceId = await sessions.requireActiveDevice(current);
      await delivery.acknowledge(
        current.account.id,
        current.id,
        deviceId,
        request.body.conversationId,
        request.body.seq,
      );
      return reply.code(204).send();
    },
  );
}
