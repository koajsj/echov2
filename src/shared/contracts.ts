export type Audience = "user" | "admin";
export type DeviceStatus = "pending" | "active" | "revoked";
export interface Account { id: string; username: string; version: string }
export interface SessionView { sessionId: string; account: Account; audience: Audience; deviceId: string | null }
export interface DeviceView { id: string; label: string; status: DeviceStatus; createdAt: string }
export interface Capability { status: "BLOCKED"; reason: string }
export interface Capabilities {
  phase: 1;
  crypto: Capability;
  messaging: Capability;
  recovery: Capability;
  systemBackup: Capability;
}
export interface DeliveryEnvelope {
  operationId: string;
  messageId: string;
  conversationId: string;
  baseEpoch: string;
  wireKind: "application" | "proposal" | "commit";
  ciphertext: string;
  expiresAt: string | null;
}
export interface DeliveryReceipt { messageId: string; seq: string; routeEpoch: string; status: "accepted" }
export interface CiphertextRecord {
  messageId: string; seq: string; epoch: string; wireKind: string;
  ciphertext: string | null; deleted: boolean; expiresAt: string | null;
}
export interface MessagePage { items: CiphertextRecord[]; next: string; highWatermark: string }
export interface ApiFailure { error: { code: string; message: string; requestId: string } }
export const limits = { attachmentBytes: 10 * 1024 * 1024, envelopeBytes: 256 * 1024, pageSize: 100, maxPageSize: 100, pageBytes: 1024 * 1024 } as const;
