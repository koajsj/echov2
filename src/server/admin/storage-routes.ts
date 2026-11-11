import { statfs } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { SessionService } from "../accounts/sessions.js";
import { HttpError } from "../api/http-error.js";

export function storageRoutes(
  app: FastifyInstance,
  sessions: SessionService,
  mediaPath: string,
): void {
  app.get("/v1/admin/storage", async (request) => {
    await sessions.require(request, "admin");
    try {
      const data = await statfs(mediaPath, { bigint: true });
      return {
        source: "media-filesystem-statfs",
        totalBytes: (data.blocks * data.bsize).toString(),
        freeBytes: (data.bavail * data.bsize).toString(),
        mediaInventoryVerified: false,
        quotaEnforced: false,
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return {
          source: "media-filesystem-statfs",
          totalBytes: null,
          freeBytes: null,
          reason: "MEDIA_DIRECTORY_NOT_PROVISIONED",
          mediaInventoryVerified: false,
          quotaEnforced: false,
        };
      throw new HttpError(
        503,
        "STORAGE_OBSERVATION_FAILED",
        "存储观测失败；不能解释为零或空目录。",
      );
    }
  });
}
