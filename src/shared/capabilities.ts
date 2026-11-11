import type { Capabilities } from "./contracts.js";

// A safety policy, not an encryption adapter. No secret-bearing API is exposed.
export const capabilities: Capabilities = {
  phase: 3,
  crypto: {
    status: "BLOCKED",
    reason:
      "MLS browser provider, identity binding and atomic persistence are not integrated or verified.",
  },
  messaging: {
    status: "BLOCKED",
    reason:
      "Trusted device admission and valid Commit recovery must pass the MLS gates before writes are enabled.",
  },
  recovery: {
    status: "BLOCKED",
    reason:
      "No reviewed root recovery or live Group State import is available.",
  },
  systemBackup: {
    status: "BLOCKED",
    reason:
      "No independent deletion anchor or verified backup/restore executor is configured.",
  },
};
