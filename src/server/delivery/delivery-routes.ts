import type { FastifyInstance } from "fastify";
import type { DeliveryEnvelope } from "../../shared/contracts.js";
import { limits } from "../../shared/contracts.js";
import { uuidSchema,sequenceSchema } from "../../shared/validation.js";
import type { SessionService } from "../accounts/sessions.js";
import type { DeliveryService } from "./delivery-service.js";
import type { ConnectionHub } from "./connection-hub.js";
import { requireReviewedCrypto } from "../messaging/crypto-gate.js";

export function deliveryRoutes(app: FastifyInstance,sessions: SessionService,delivery: DeliveryService,hub: ConnectionHub): void {
  app.get("/v1/events", { websocket: true, preValidation: async request => {
    sessions.assertOrigin(request); await sessions.require(request);
  } }, (socket,request) => {
    // Install listeners synchronously; no inbound messages are accepted.
    socket.on("error",() => socket.close());
    void sessions.require(request).then(current => {
      if (socket.readyState === 1) hub.attach(socket,current.id,current.account.id);
    }).catch(() => socket.close(1008,"Session unavailable"));
  });
  app.post<{ Body: DeliveryEnvelope }>("/v1/messages", { schema: { body: {
    type: "object",additionalProperties: false,required: ["operationId","messageId","conversationId","baseEpoch","wireKind","ciphertext","expiresAt"],
    properties: { operationId: uuidSchema,messageId: uuidSchema,conversationId: uuidSchema,baseEpoch: sequenceSchema,wireKind: { type: "string",enum: ["application","proposal","commit"] },ciphertext: { type: "string",minLength: 4,maxLength: 349528 },expiresAt: { anyOf: [{ type: "string",format: "date-time" },{ type: "null" }] } },
  } } }, async request => {
    sessions.assertCsrf(request,"user");
    const current=await sessions.require(request);
    const deviceId=await sessions.requireActiveDevice(current);
    requireReviewedCrypto();
    return delivery.append(current.account.id,deviceId,request.body);
  });
  app.get<{ Params: { id: string }; Querystring: { after?: string; limit?: number } }>("/v1/conversations/:id/messages", { schema: {
    params: { type: "object",required: ["id"],additionalProperties: false,properties: { id: uuidSchema } },
    querystring: { type: "object",additionalProperties: false,properties: { after: sequenceSchema,limit: { type: "integer",minimum: 1,maximum: limits.maxPageSize } } },
  } }, async request => {
    const current=await sessions.require(request); const deviceId=await sessions.requireActiveDevice(current);
    return delivery.page(current.account.id,deviceId,request.params.id,request.query.after ?? "0",request.query.limit ?? limits.pageSize);
  });
  app.post<{ Body: { conversationId: string; seq: string } }>("/v1/cursors", { schema: { body: { type: "object",additionalProperties: false,required: ["conversationId","seq"],properties: { conversationId: uuidSchema,seq: sequenceSchema } } } }, async (request,reply) => {
    sessions.assertCsrf(request,"user"); const current=await sessions.require(request); const deviceId=await sessions.requireActiveDevice(current);
    await delivery.acknowledge(current.account.id,deviceId,request.body.conversationId,request.body.seq);
    return reply.code(204).send();
  });
}
