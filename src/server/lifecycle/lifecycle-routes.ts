import type { FastifyInstance } from "fastify";
import { sequence } from "../delivery/delivery-service.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import type { SessionService } from "../accounts/sessions.js";
import type { DeletionService } from "./deletion-service.js";
export function lifecycleRoutes(
  app: FastifyInstance,
  sessions: SessionService,
  deletions: DeletionService,
): void {
  app.post<{
    Params: {
      id: string;
    };
    Body: {
      operationId: string;
    };
  }>(
    "/v1/messages/:id/delete",
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
        body: {
          type: "object",
          additionalProperties: false,
          required: ["operationId"],
          properties: {
            operationId: uuidSchema,
          },
        },
      },
    },
    async (request, reply) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      await sessions.requireActiveDevice(current);
      const result = await deletions.request(
        current.account.id,
        current.id,
        request.params.id,
        request.body.operationId,
      );
      return reply.code(202).send({
        ...result,
        erasureComplete: false,
        blocker:
          "Independent deletion anchor and physical purge executor are not configured.",
      });
    },
  );
  app.get<{
    Querystring: {
      before?: string;
    };
  }>(
    "/v1/deletions/own",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            before: sequenceSchema,
          },
        },
      },
    },
    async (request) => {
      const current = await sessions.require(request);
      return deletions.ownRequests(
        current.account.id,
        request.query.before ? sequence(request.query.before) : null,
      );
    },
  );
}
