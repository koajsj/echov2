import type { FastifyInstance } from "fastify";
import type { SessionService } from "../accounts/sessions.js";
import type { ProductIdentityService } from "./product-identity-service.js";
import type {
  SignedAuthorization,
  SignedRoot,
  IdentitySessionChallenge,
} from "../../shared/crypto-identity.js";
import { uuidSchema } from "../../shared/validation.js";
const hex32 = { type: "string", pattern: "^[0-9a-f]{64}$" };
const hex64 = { type: "string", pattern: "^[0-9a-f]{128}$" };
const statement = { type: "object", maxProperties: 12 };
const root = {
  type: "object",
  additionalProperties: false,
  required: ["statement", "signature"],
  properties: { statement, signature: hex64 },
};
const authorization = {
  type: "object",
  additionalProperties: false,
  required: ["credential", "rootSignature", "deviceSignature"],
  properties: {
    credential: statement,
    rootSignature: hex64,
    deviceSignature: hex64,
  },
};
export function productIdentityRoutes(
  app: FastifyInstance,
  sessions: SessionService,
  identity: ProductIdentityService,
): void {
  app.post<{ Body: { operationId: string; deviceId: string } }>(
    "/v1/crypto-identity/session-challenges",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["operationId", "deviceId"],
          properties: { operationId: uuidSchema, deviceId: uuidSchema },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      return identity.sessionChallenge(
        await sessions.require(request, "user", true),
        request.body.operationId,
        request.body.deviceId,
      );
    },
  );
  app.post<{
    Body: { challenge: IdentitySessionChallenge; signature: string };
  }>(
    "/v1/crypto-identity/bind-session",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["challenge", "signature"],
          properties: { challenge: statement, signature: hex64 },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      return identity.bindSession(
        await sessions.require(request, "user", true),
        request.body.challenge,
        request.body.signature,
      );
    },
  );
  app.get("/v1/crypto-identity", async (request) =>
    identity.snapshot((await sessions.require(request, "user")).account.id),
  );
  app.post<{ Body: { operationId: string; devicePublicKey: string } }>(
    "/v1/crypto-identity/challenges",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["operationId", "devicePublicKey"],
          properties: { operationId: uuidSchema, devicePublicKey: hex32 },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      return identity.challenge(
        await sessions.require(request, "user", true),
        request.body.operationId,
        request.body.devicePublicKey,
      );
    },
  );
  app.post<{ Body: { root: SignedRoot; authorization: SignedAuthorization } }>(
    "/v1/crypto-identity/initialize",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["root", "authorization"],
          properties: { root, authorization },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      return identity.authorize(
        await sessions.require(request, "user", true),
        request.body.authorization,
        request.body.root,
      );
    },
  );
  app.post<{ Body: { authorization: SignedAuthorization } }>(
    "/v1/crypto-identity/authorize",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["authorization"],
          properties: { authorization },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      return identity.authorize(
        await sessions.require(request, "user", true),
        request.body.authorization,
      );
    },
  );
}
